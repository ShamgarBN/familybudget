import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  AccountDef,
  AccountKind,
  AppState,
  Category,
  PayPeriod,
  RecurringOwnedField,
  RecurringRule,
  SplitPart,
  Transaction,
  Subcategory,
} from '../types'
import { budgetKey } from '../types'
import { createDefaultState, mergeNewDefaults, SCHEMA_VERSION } from './defaults'
import { ensurePeriodForDate, sortedPeriods, buildPeriod, nextStart } from '../lib/payPeriods'
import { syncRuleTransactions } from '../lib/recurring'
import { trainRule } from '../lib/categorize'

const STORAGE_KEY = 'nfm_v1'
const BACKUP_PREFIX = 'nfm_backup_'
const BACKUP_RETAIN_DAYS = 14
const UNDO_LIMIT = 30

type Snapshot = Pick<
  AppState,
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'recurring'
  | 'payPeriods'
  | 'budgets'
  | 'learnedRules'
  | 'settings'
>

interface StoreActions {
  /* persistence */
  load: () => void
  reset: () => void
  importState: (json: unknown) => void
  exportState: () => string

  /* accounts */
  updateAccount: (id: AccountKind, patch: Partial<AccountDef>) => void

  /* undo */
  undo: () => void

  /* ui */
  setSearch: (s: string) => void
  toggleAccountFilter: (a: AccountKind) => void
  clearAccountFilter: () => void
  setDonutFilter: (catId: string | null) => void
  togglePeriodCollapsed: (id: string) => void
  setAllPeriodsCollapsed: (collapsed: boolean) => void
  toggleBudgetOpen: (id: string) => void

  /* categories */
  upsertCategory: (cat: Category) => void
  deleteCategory: (id: string) => void
  upsertSubcategory: (catId: string, sub: Subcategory) => void
  deleteSubcategory: (catId: string, subId: string) => void

  /* pay periods */
  addPayPeriod: (startISO?: string) => string
  updatePayPeriod: (id: string, patch: Partial<PayPeriod>) => void
  deletePayPeriod: (id: string) => void

  /* transactions */
  addTransaction: (t: Omit<Transaction, 'id'>) => string
  addTransactionsBulk: (ts: Omit<Transaction, 'id'>[]) => string[]
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  bulkUpdateTransactions: (
    updates: Array<{ id: string; patch: Partial<Transaction> }>,
  ) => void
  deleteTransactions: (ids: string[]) => void
  setSplits: (id: string, splits: SplitPart[] | undefined) => void
  /** Drop manual overrides on a recurring instance and re-sync from the rule. */
  revertOverrides: (id: string) => void
  /** Mark a recurring instance as skipped (hidden from ledger/budgets/projections). */
  setSkipped: (id: string, skipped: boolean) => void
  /** Toggle the `flagged` flag on a transaction (used as a "review later" star). */
  toggleFlagged: (id: string) => void

  /* recurring */
  upsertRecurring: (r: RecurringRule) => void
  deleteRecurring: (id: string) => void
  regenerateAllRecurring: () => void

  /* budget */
  setBudget: (ppId: string, catId: string, amount: number, subId?: string) => void

  /* learned rules */
  clearLearnedRule: (signature: string) => void
  clearAllLearnedRules: () => void

  /* settings */
  setSettings: (patch: Partial<AppState['settings']>) => void
}

export type Store = AppState & StoreActions

function loadFromStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppState>
    if (typeof parsed !== 'object' || parsed === null) return null
    // Schema migration hook (kept simple for V1).
    return mergeNewDefaults({ ...createDefaultState(), ...parsed } as AppState)
  } catch {
    return null
  }
}

function persist(state: AppState): void {
  const slim: AppState = {
    ...state,
    schemaVersion: SCHEMA_VERSION,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim))
  } catch {
    /* quota or privacy mode — ignore */
  }
}

/**
 * Daily rolling backup. The first time the app runs on any given calendar day,
 * we snapshot the current state under `nfm_backup_YYYY-MM-DD` and prune any
 * snapshots older than BACKUP_RETAIN_DAYS. This is best-effort — quota errors
 * during pruning are swallowed because losing yesterday's auto-backup is
 * non-critical.
 */
function dailyBackup(state: AppState): void {
  if (typeof localStorage === 'undefined') return
  const today = new Date()
  const key = `${BACKUP_PREFIX}${today.toISOString().slice(0, 10)}`

  try {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(state))
    }
  } catch {
    /* quota — skip today's backup */
  }

  // Prune old snapshots.
  const cutoff = new Date(today.getTime() - BACKUP_RETAIN_DAYS * 86400_000)
  const cutoffISO = cutoff.toISOString().slice(0, 10)
  try {
    const toDelete: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(BACKUP_PREFIX)) continue
      const dateStr = k.slice(BACKUP_PREFIX.length)
      if (dateStr < cutoffISO) toDelete.push(k)
    }
    for (const k of toDelete) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/** Enumerate available auto-backup snapshots, newest first. */
export function listBackups(): { date: string; key: string }[] {
  if (typeof localStorage === 'undefined') return []
  const entries: { date: string; key: string }[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(BACKUP_PREFIX)) continue
    const date = k.slice(BACKUP_PREFIX.length)
    if (date) entries.push({ date, key: k })
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}

/** Read a single auto-backup snapshot by storage key. */
export function readBackup(key: string): unknown | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Lightweight debouncer for UI-only writes. Keystrokes in the search box and
 * pill-toggle clicks no longer JSON.stringify the entire state on every event;
 * instead they coalesce into a single localStorage write up to 400ms later.
 *
 * `mutate` (real data changes) still writes immediately so a hard crash never
 * loses meaningful work.
 */
let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: AppState | null = null
function schedulePersist(state: AppState): void {
  pendingState = state
  if (persistTimer !== null) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (pendingState) {
      persist(pendingState)
      pendingState = null
    }
  }, 400)
}
/** Force any pending UI write to flush — called from mutate() and on unload. */
function flushPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (pendingState) {
    persist(pendingState)
    pendingState = null
  }
}
if (typeof window !== 'undefined') {
  // Best-effort flush on tab close / app quit.
  window.addEventListener('beforeunload', flushPersist)
  window.addEventListener('pagehide', flushPersist)
}

const undoStack: Snapshot[] = []

function pushUndo(state: AppState): void {
  const snap: Snapshot = {
    accounts: state.accounts,
    categories: state.categories,
    transactions: state.transactions,
    recurring: state.recurring,
    payPeriods: state.payPeriods,
    budgets: state.budgets,
    learnedRules: state.learnedRules,
    settings: state.settings,
  }
  undoStack.push(snap)
  if (undoStack.length > UNDO_LIMIT) undoStack.shift()
}

export const useStore = create<Store>((set, get) => {
  const initial = loadFromStorage() ?? createDefaultState()
  // Snapshot the current state once per day, even on first run, so users have
  // 14 days of recovery points without lifting a finger.
  dailyBackup(initial)

  /** Wraps a state mutation so it pushes an undo snapshot then persists. */
  const mutate = (fn: (s: AppState) => Partial<AppState>) => {
    const prev = get()
    pushUndo(prev)
    set((s) => {
      const patch = fn(s)
      const next = { ...s, ...patch } as AppState
      flushPersist()
      persist(next)
      return next
    })
  }

  /** UI-only state setter — debounces persistence to avoid a full JSON.stringify on every keystroke. */
  const setUI = (fn: (s: AppState) => Partial<AppState['ui']>) => {
    set((s) => {
      const ui = { ...s.ui, ...fn(s) }
      const next = { ...s, ui }
      schedulePersist(next)
      return next
    })
  }

  return {
    ...initial,

    /* persistence */
    load: () => {
      const fresh = loadFromStorage()
      if (fresh) set(fresh)
    },
    reset: () => {
      undoStack.length = 0
      const fresh = createDefaultState()
      persist(fresh)
      set(fresh)
    },
    importState: (json) => {
      try {
        const data = json as AppState
        if (typeof data !== 'object' || data === null) throw new Error('invalid')
        const merged = mergeNewDefaults({
          ...createDefaultState(),
          ...data,
        } as AppState)
        pushUndo(get())
        persist(merged)
        set(merged)
      } catch (e) {
        console.error('importState failed', e)
      }
    },
    exportState: () => JSON.stringify(get(), null, 2),

    /* undo */
    undo: () => {
      const last = undoStack.pop()
      if (!last) return
      set((s) => {
        const next = { ...s, ...last }
        persist(next)
        return next
      })
    },

    /* ui (no undo for ui prefs; persistence is debounced via setUI) */
    setSearch: (search) => setUI(() => ({ search })),
    toggleAccountFilter: (a) =>
      setUI((s) => {
        const cur = s.ui.accountFilter
        return {
          accountFilter: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a],
        }
      }),
    clearAccountFilter: () => setUI(() => ({ accountFilter: [] })),
    setDonutFilter: (catId) => setUI(() => ({ donutFilter: catId })),
    togglePeriodCollapsed: (id) =>
      setUI((s) => {
        const cur = s.ui.collapsedPeriods
        return {
          collapsedPeriods: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        }
      }),
    setAllPeriodsCollapsed: (collapsed) =>
      setUI((s) => ({
        collapsedPeriods: collapsed ? s.payPeriods.map((p) => p.id) : [],
      })),
    toggleBudgetOpen: (id) =>
      setUI((s) => {
        const cur = s.ui.openBudgets
        return {
          openBudgets: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        }
      }),

    /* accounts */
    updateAccount: (id, patch) =>
      mutate((s) => ({
        accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),

    /* categories */
    upsertCategory: (cat) =>
      mutate((s) => {
        const idx = s.categories.findIndex((c) => c.id === cat.id)
        const next = [...s.categories]
        if (idx >= 0) next[idx] = { ...cat }
        else next.push({ ...cat })
        return { categories: next }
      }),
    deleteCategory: (id) =>
      mutate((s) => {
        // Move any orphaned transactions and recurring rules to "Other" so the
        // ledger never shows a phantom catId. Splits are scrubbed too —
        // anything pointing at the deleted catId is rerouted, anything
        // pointing at a sub of the deleted cat loses its sub.
        const fallback =
          s.categories.find((c) => c.id !== id && c.name.toLowerCase() === 'other')
            ?.id ??
          s.categories.find((c) => c.id !== id && !c.isIncome && !c.isTransfer)
            ?.id ??
          s.categories.find((c) => c.id !== id)?.id ??
          ''
        const reroute = <T extends { catId: string; subId?: string }>(t: T): T =>
          t.catId === id ? { ...t, catId: fallback, subId: undefined } : t

        const transactions = s.transactions.map((t) => {
          const r = reroute(t)
          if (r.splits) {
            r.splits = r.splits.map(reroute)
          }
          return r
        })
        const recurring = s.recurring.map(reroute)
        return {
          categories: s.categories.filter((c) => c.id !== id),
          transactions,
          recurring,
        }
      }),
    upsertSubcategory: (catId, sub) =>
      mutate((s) => {
        const next = s.categories.map((c) => {
          if (c.id !== catId) return c
          const idx = c.subs.findIndex((x) => x.id === sub.id)
          const subs = [...c.subs]
          if (idx >= 0) subs[idx] = { ...sub }
          else subs.push({ ...sub })
          return { ...c, subs }
        })
        return { categories: next }
      }),
    deleteSubcategory: (catId, subId) =>
      mutate((s) => {
        const next = s.categories.map((c) =>
          c.id === catId ? { ...c, subs: c.subs.filter((x) => x.id !== subId) } : c,
        )
        // Strip the deleted sub from any transactions / splits / rules so a
        // legacy subId reference doesn't make the row appear in a phantom
        // bucket.
        const stripSub = <T extends { catId: string; subId?: string }>(t: T): T =>
          t.catId === catId && t.subId === subId ? { ...t, subId: undefined } : t
        const transactions = s.transactions.map((t) => {
          const r = stripSub(t)
          if (r.splits) r.splits = r.splits.map(stripSub)
          return r
        })
        const recurring = s.recurring.map(stripSub)
        return { categories: next, transactions, recurring }
      }),

    /* pay periods */
    addPayPeriod: (startISO) => {
      const s = get()
      const sorted = sortedPeriods(s.payPeriods)
      const start =
        startISO ??
        (sorted.length > 0
          ? nextStart(sorted[sorted.length - 1].end, s.settings.payPeriodFrequency)
          : s.settings.payPeriodAnchor)
      const pp = buildPeriod(start, s.settings.payPeriodFrequency)
      mutate((cur) => ({ payPeriods: [...cur.payPeriods, pp] }))
      return pp.id
    },
    updatePayPeriod: (id, patch) =>
      mutate((s) => ({
        payPeriods: s.payPeriods.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    deletePayPeriod: (id) =>
      mutate((s) => ({
        payPeriods: s.payPeriods.filter((p) => p.id !== id),
        budgets: Object.fromEntries(
          Object.entries(s.budgets).filter(([k]) => k !== id),
        ),
      })),

    /* transactions */
    addTransaction: (t) => {
      const id = uuid()
      const s = get()
      const { periods } = ensurePeriodForDate(
        s.payPeriods,
        t.date,
        s.settings.payPeriodAnchor,
        s.settings.payPeriodFrequency,
      )
      const fullTx: Transaction = { id, ...t }
      mutate(() => ({
        transactions: [...s.transactions, fullTx],
        payPeriods: periods,
      }))
      return id
    },
    addTransactionsBulk: (ts) => {
      if (ts.length === 0) return []
      const s = get()
      const ids: string[] = []
      const newTxs: Transaction[] = ts.map((t) => {
        const id = uuid()
        ids.push(id)
        return { id, ...t }
      })
      // Extend pay periods to cover any new dates.
      let periods = s.payPeriods
      for (const t of newTxs) {
        const r = ensurePeriodForDate(
          periods,
          t.date,
          s.settings.payPeriodAnchor,
          s.settings.payPeriodFrequency,
        )
        periods = r.periods
      }
      mutate(() => ({
        transactions: [...s.transactions, ...newTxs],
        payPeriods: periods,
      }))
      return ids
    },
    bulkUpdateTransactions: (updates) => {
      if (updates.length === 0) return
      const map = new Map(updates.map((u) => [u.id, u.patch]))
      mutate((s) => ({
        transactions: s.transactions.map((t) => {
          const patch = map.get(t.id)
          return patch ? { ...t, ...patch } : t
        }),
      }))
    },
    updateTransaction: (id, patch) => {
      const s = get()
      const t = s.transactions.find((x) => x.id === id)
      if (!t) return
      const newDate = patch.date ?? t.date
      const { periods } = ensurePeriodForDate(
        s.payPeriods,
        newDate,
        s.settings.payPeriodAnchor,
        s.settings.payPeriodFrequency,
      )

      // Detect explicit user re-categorization and persist a learned rule.
      const catChanged =
        patch.catId !== undefined && patch.catId !== t.catId
      const subChanged = 'subId' in patch && patch.subId !== t.subId

      // Recurring-instance edits: record which rule-owned fields the user
      // touched so future regen passes preserve them.
      const ruleOwned: RecurringOwnedField[] = [
        'title',
        'memo',
        'amount',
        'type',
        'catId',
        'subId',
        'account',
      ]
      const newOverrides = new Set<RecurringOwnedField>(t.overrides ?? [])
      let overridesChanged = false
      if (t.recurringId) {
        const tAny = t as unknown as Record<string, unknown>
        const pAny = patch as unknown as Record<string, unknown>
        for (const field of ruleOwned) {
          if (!(field in patch)) continue
          if (tAny[field] === pAny[field]) continue
          if (!newOverrides.has(field)) {
            newOverrides.add(field)
            overridesChanged = true
          }
        }
      }

      mutate((cur) => {
        const merged: Transaction = { ...t, ...patch }
        if (overridesChanged) {
          merged.overrides = Array.from(newOverrides)
        }
        let learnedRules = cur.learnedRules
        if (catChanged || subChanged) {
          learnedRules = trainRule(
            learnedRules,
            { title: merged.title, memo: merged.memo },
            merged.catId,
            merged.subId,
          )
        }
        return {
          transactions: cur.transactions.map((x) =>
            x.id === id ? merged : x,
          ),
          payPeriods: periods,
          learnedRules,
        }
      })
    },
    deleteTransactions: (ids) =>
      mutate((s) => ({
        transactions: s.transactions.filter((t) => !ids.includes(t.id)),
      })),
    setSplits: (id, splits) =>
      mutate((s) => ({
        transactions: s.transactions.map((t) =>
          t.id === id ? { ...t, splits } : t,
        ),
      })),
    revertOverrides: (id) =>
      mutate((s) => {
        const tx = s.transactions.find((x) => x.id === id)
        if (!tx || !tx.recurringId) return {}
        const rule = s.recurring.find((r) => r.id === tx.recurringId)
        if (!rule) return {}
        // Restore every rule-owned field, then clear the overrides marker.
        const reset: Transaction = {
          ...tx,
          account: rule.account,
          title: rule.title,
          memo: rule.memo,
          catId: rule.catId,
          subId: rule.subId,
          amount: rule.amount,
          type: rule.type,
        }
        delete reset.overrides
        return {
          transactions: s.transactions.map((t) => (t.id === id ? reset : t)),
        }
      }),
    setSkipped: (id, skipped) =>
      mutate((s) => ({
        transactions: s.transactions.map((t) =>
          t.id === id ? { ...t, skipped } : t,
        ),
      })),
    toggleFlagged: (id) =>
      mutate((s) => ({
        transactions: s.transactions.map((t) =>
          t.id === id ? { ...t, flagged: !t.flagged } : t,
        ),
      })),

    /* recurring */
    upsertRecurring: (r) =>
      mutate((s) => {
        const others = s.recurring.filter((x) => x.id !== r.id)
        const recurring = [...others, r].sort((a, b) =>
          a.title.localeCompare(b.title),
        )
        const transactions = syncRuleTransactions(r, s.transactions)
        return { recurring, transactions }
      }),
    deleteRecurring: (id) =>
      mutate((s) => ({
        recurring: s.recurring.filter((r) => r.id !== id),
        transactions: s.transactions.filter((t) => t.recurringId !== id),
      })),
    regenerateAllRecurring: () => {
      const s = get()
      let txs = s.transactions
      for (const r of s.recurring) txs = syncRuleTransactions(r, txs)
      // Identity check: syncRuleTransactions returns the same reference when
      // nothing changes. Avoid pushing an undo snapshot / writing localStorage
      // when boot-time regen is a no-op.
      if (txs === s.transactions) return
      mutate(() => ({ transactions: txs }))
    },

    /* budget */
    setBudget: (ppId, catId, amount, subId) =>
      mutate((s) => {
        const key = budgetKey(catId, subId)
        const period = { ...(s.budgets[ppId] ?? {}) }
        if (amount === 0 || Number.isNaN(amount)) delete period[key]
        else period[key] = amount
        return { budgets: { ...s.budgets, [ppId]: period } }
      }),

    /* learned rules */
    clearLearnedRule: (sig) =>
      mutate((s) => {
        if (!s.learnedRules[sig]) return {}
        const next = { ...s.learnedRules }
        delete next[sig]
        return { learnedRules: next }
      }),
    clearAllLearnedRules: () =>
      mutate(() => ({ learnedRules: {} })),

    /* settings */
    setSettings: (patch) =>
      mutate((s) => ({ settings: { ...s.settings, ...patch } })),
  }
})

/** Useful in tests / debugging — not exported via UI. */
export const _store = { loadFromStorage, persist, undoStack }
