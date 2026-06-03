import { useCallback, useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { sortedPeriods } from '../lib/payPeriods'
import { PayPeriodSection } from './PayPeriodSection'
import { BulkActionsBar } from './BulkActionsBar'
import { filterTransactions, sortedCategories } from '../store/selectors'
import { EPS, getCategorySpent, getEffectiveB } from '../lib/budget'
import { todayISO } from '../lib/dates'
import type { PayPeriod } from '../types'

interface YearGroup {
  year: string
  periods: PayPeriod[]
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function nextDayISO(iso: string): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + 1)
  return toISODate(d)
}

function daysBetweenInclusive(startISO: string, endISO: string): number {
  return Math.floor((parseISODate(endISO).getTime() - parseISODate(startISO).getTime()) / MS_PER_DAY) + 1
}

function owningYear(period: PayPeriod): string {
  const counts = new Map<string, number>()
  let cursor = period.start

  while (cursor <= period.end) {
    const year = cursor.slice(0, 4)
    const endOfYear = `${year}-12-31`
    const segmentEnd = endOfYear < period.end ? endOfYear : period.end
    counts.set(year, (counts.get(year) ?? 0) + daysBetweenInclusive(cursor, segmentEnd))
    cursor = nextDayISO(segmentEnd)
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? period.start.slice(0, 4)
}

function groupPeriodsByYear(periods: PayPeriod[]): YearGroup[] {
  const map = new Map<string, PayPeriod[]>()
  for (const period of periods) {
    const year = owningYear(period)
    map.set(year, [...(map.get(year) ?? []), period])
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, groupedPeriods]) => ({ year, periods: groupedPeriods }))
}

export function Ledger() {
  const periods = useStore((s) => s.payPeriods)
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const accounts = useStore((s) => s.accounts)
  const budgets = useStore((s) => s.budgets)
  const ui = useStore((s) => s.ui)
  const addPayPeriod = useStore((s) => s.addPayPeriod)
  const setAllPeriodsCollapsed = useStore((s) => s.setAllPeriodsCollapsed)
  const deleteTransactions = useStore((s) => s.deleteTransactions)

  const [selected, setSelected] = useState<string[]>([])
  const [collapsedYears, setCollapsedYears] = useState<string[]>([])

  const sorted = useMemo(() => sortedPeriods(periods), [periods])
  const yearGroups = useMemo(() => groupPeriodsByYear(sorted), [sorted])

  /** Pre-sort categories once; pass into rows so each row doesn't re-sort. */
  const sortedCats = useMemo(() => sortedCategories(categories), [categories])

  const filteredTx = useMemo(
    () => filterTransactions(transactions, categories, ui),
    [transactions, categories, ui],
  )

  /**
   * Single sorted pass over all transactions, used to compute:
   *   - running balance per transaction id (across all periods)
   *   - real end balance per pay period
   *
   * Sharing one walk avoids each PayPeriodSection re-sorting the entire
   * transaction list independently.
   */
  const { runningBalances, realEndByPeriod } = useMemo(() => {
    const balances = new Map<string, number>()
    const endByPeriod = new Map<string, number>()

    const sortedTx = transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))

    // Anchor the balance with each account's user-set starting balance so a
    // mid-history CSV import doesn't erroneously begin at $0.
    let bal = 0
    for (const a of accounts) {
      if (ui.accountFilter.length && !ui.accountFilter.includes(a.id)) continue
      bal += a.startingBalance ?? 0
    }
    let pIdx = 0
    for (const t of sortedTx) {
      if (t.skipped) continue
      // Stamp end-of-period balance BEFORE applying this tx, so a transaction
      // dated in the next period (paycheck on the 1st, etc.) doesn't bleed
      // into the prior period's reported end balance.
      while (pIdx < sorted.length && t.date > sorted[pIdx].end) {
        endByPeriod.set(sorted[pIdx].id, bal)
        pIdx++
      }
      // Account-filter respected so the displayed running balance matches the visible filter.
      if (!ui.accountFilter.length || ui.accountFilter.includes(t.account)) {
        if (t.type === 'income') bal += t.amount
        else if (t.type === 'expense') bal -= t.amount
        balances.set(t.id, bal)
      }
    }
    while (pIdx < sorted.length) {
      endByPeriod.set(sorted[pIdx].id, bal)
      pIdx++
    }
    return { runningBalances: balances, realEndByPeriod: endByPeriod }
  }, [sorted, transactions, accounts, ui.accountFilter])

  /**
   * Rolling projected balance per pay period:
   *   real_end_balance - cumulative_unspent_budget(through this period)
   * Past periods contribute zero drain (unused budget stays in the bank);
   * the current and future periods contribute their unspent budget.
   */
  const projectionByPeriod = useMemo(() => {
    const today = todayISO()
    const map = new Map<string, number>()

    let cumulativeDrain = 0
    for (const p of sorted) {
      let drain = 0
      const isPast = p.end < today
      const isFuture = p.start > today
      if (!isPast) {
        for (const c of categories) {
          if (c.isIncome) continue
          const eff = getEffectiveB(budgets, c, p.id).effective
          if (eff <= EPS) continue
          if (isFuture) {
            drain += eff
          } else {
            const spent = getCategorySpent(transactions, p, c)
            drain += Math.max(0, eff - spent)
          }
        }
      }
      cumulativeDrain += drain
      map.set(p.id, (realEndByPeriod.get(p.id) ?? 0) - cumulativeDrain)
    }
    return map
  }, [sorted, transactions, categories, budgets, realEndByPeriod])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const toggleSelected = useCallback((id: string) => {
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    )
  }, [])

  const setManySelected = useCallback((ids: string[], desired: boolean) => {
    setSelected((cur) => {
      const set = new Set(cur)
      if (desired) ids.forEach((id) => set.add(id))
      else ids.forEach((id) => set.delete(id))
      return Array.from(set)
    })
  }, [])

  const onDeleteSelected = () => {
    if (selected.length === 0) return
    if (!confirm(`Delete ${selected.length} transactions?`)) return
    deleteTransactions(selected)
    setSelected([])
  }

  const toggleYear = (year: string) =>
    setCollapsedYears((cur) =>
      cur.includes(year) ? cur.filter((y) => y !== year) : [...cur, year],
    )

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-slate-50/40">
        <h2 className="text-base font-semibold">Ledger</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => setAllPeriodsCollapsed(false)}
            title="Expand all pay periods"
          >
            ⊞ Expand all
          </button>
          <button
            className="btn"
            onClick={() => setAllPeriodsCollapsed(true)}
            title="Collapse all pay periods"
          >
            ⊟ Collapse all
          </button>
          <button className="btn" onClick={() => addPayPeriod()}>
            + Pay period
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="px-5 py-2 border-b border-line bg-white">
          <BulkActionsBar
            selectedIds={selected}
            onClearSelection={() => setSelected([])}
            onDelete={onDeleteSelected}
          />
        </div>
      )}

      <div className="divide-y divide-line">
        {sorted.length === 0 ? (
          <div className="p-10 text-center text-muted">
            <p className="mb-3">No pay periods yet.</p>
            <button
              className="btn btn-primary"
              onClick={() => addPayPeriod()}
            >
              + Create your first pay period
            </button>
          </div>
        ) : (
          yearGroups.map((group) => {
            const collapsed = collapsedYears.includes(group.year)
            return (
              <section key={group.year}>
                <button
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-slate-100/70 hover:bg-slate-100 text-left border-b border-line"
                  onClick={() => toggleYear(group.year)}
                  aria-expanded={!collapsed}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="text-muted w-5">{collapsed ? '▸' : '▾'}</span>
                    {group.year}
                  </span>
                  <span className="text-xs text-muted">
                    {group.periods.length} pay period{group.periods.length === 1 ? '' : 's'}
                  </span>
                </button>

                {!collapsed && (
                  <div className="divide-y divide-line">
                    {group.periods.map((p) => (
                      <PayPeriodSection
                        key={p.id}
                        period={p}
                        filteredTx={filteredTx}
                        selectedSet={selectedSet}
                        onToggleSelect={toggleSelected}
                        onToggleMany={setManySelected}
                        cats={sortedCats}
                        runningBalances={runningBalances}
                        endBalance={realEndByPeriod.get(p.id) ?? 0}
                        rollingProjection={projectionByPeriod.get(p.id) ?? 0}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
