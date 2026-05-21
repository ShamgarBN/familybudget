import type { AppState, Category, Transaction } from '../types'

/** Categories sorted A→Z, but Income/Transfer-style categories always last. */
export function sortedCategories(cats: Category[]): Category[] {
  const trailing = (c: Category) => (c.isIncome || c.isTransfer ? 1 : 0)
  return [...cats].sort((a, b) => {
    const ta = trailing(a)
    const tb = trailing(b)
    if (ta !== tb) return ta - tb
    return a.name.localeCompare(b.name)
  })
}

export function findCategory(
  cats: Category[],
  catId: string,
): Category | undefined {
  return cats.find((c) => c.id === catId)
}

/** Parse a donut-filter key. Supports both `catId` and `catId:subId`. */
export function parseDonutKey(key: string | null): {
  catId: string | null
  subId: string | null
} {
  if (!key) return { catId: null, subId: null }
  const idx = key.indexOf(':')
  if (idx < 0) return { catId: key, subId: null }
  return { catId: key.slice(0, idx), subId: key.slice(idx + 1) || null }
}

/**
 * Tokens parsed out of the search box. Free-text words are matched against the
 * "haystack" (title + memo + category + subcategory). Operators apply
 * exact-ish field constraints.
 *
 * Supported operators:
 *   amount:>50, amount:<10, amount:=12.34, amount:>=100, amount:<=200
 *   category:Bills           — partial, case-insensitive match on cat name (or its subs)
 *   account:bank|credit|savings
 *   cleared:yes|no
 *   flagged:yes|no
 *   type:expense|income|neutral
 *   before:2026-01-15        — date <= operand
 *   after:2026-01-15         — date >= operand
 */
interface ParsedQuery {
  freeText: string
  amount?: { op: '<' | '>' | '<=' | '>=' | '='; value: number }
  category?: string
  account?: string
  cleared?: boolean
  flagged?: boolean
  type?: 'expense' | 'income' | 'neutral'
  before?: string
  after?: string
}

const OPERATOR_RE = /(\w+):([><=]{0,2}[^\s]+)/g

function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = { freeText: '' }
  let text = raw
  text = text.replace(OPERATOR_RE, (match, key: string, val: string) => {
    const k = key.toLowerCase()
    if (k === 'amount') {
      const m = val.match(/^([<>]=?|=)?(-?\d+(?:\.\d+)?)$/)
      if (m) {
        const op = (m[1] || '=') as '<' | '>' | '<=' | '>=' | '='
        out.amount = { op, value: parseFloat(m[2]) }
        return ''
      }
    } else if (k === 'category' || k === 'cat') {
      out.category = val.toLowerCase()
      return ''
    } else if (k === 'account') {
      out.account = val.toLowerCase()
      return ''
    } else if (k === 'cleared') {
      out.cleared = /^(y|yes|true|1)$/i.test(val)
      return ''
    } else if (k === 'flagged') {
      out.flagged = /^(y|yes|true|1)$/i.test(val)
      return ''
    } else if (k === 'type') {
      const v = val.toLowerCase()
      if (v === 'expense' || v === 'income' || v === 'neutral') {
        out.type = v
        return ''
      }
    } else if (k === 'before') {
      out.before = val
      return ''
    } else if (k === 'after') {
      out.after = val
      return ''
    }
    return match
  })
  out.freeText = text.trim().toLowerCase()
  return out
}

/** Filter transactions by current UI search + account filter + donut filter. */
export function filterTransactions(
  txs: Transaction[],
  cats: Category[],
  ui: AppState['ui'],
): Transaction[] {
  const parsed = parseQuery(ui.search)
  const donut = parseDonutKey(ui.donutFilter)
  return txs.filter((t) => {
    if (t.skipped) return false
    if (ui.accountFilter.length && !ui.accountFilter.includes(t.account)) return false
    if (donut.catId) {
      const matchesTx =
        t.catId === donut.catId &&
        (donut.subId === null || t.subId === donut.subId)
      const matchesSplit = !!t.splits?.some(
        (s) =>
          s.catId === donut.catId &&
          (donut.subId === null || s.subId === donut.subId),
      )
      if (!matchesTx && !matchesSplit) return false
    }

    if (parsed.amount) {
      const v = t.amount
      const a = parsed.amount
      if (a.op === '<' && !(v < a.value)) return false
      if (a.op === '>' && !(v > a.value)) return false
      if (a.op === '<=' && !(v <= a.value)) return false
      if (a.op === '>=' && !(v >= a.value)) return false
      if (a.op === '=' && !(Math.abs(v - a.value) < 0.005)) return false
    }
    if (parsed.account && !t.account.toLowerCase().includes(parsed.account))
      return false
    if (parsed.cleared !== undefined && !!t.cleared !== parsed.cleared)
      return false
    if (parsed.flagged !== undefined && !!t.flagged !== parsed.flagged)
      return false
    if (parsed.type && t.type !== parsed.type) return false
    if (parsed.before && t.date > parsed.before) return false
    if (parsed.after && t.date < parsed.after) return false

    const cat = findCategory(cats, t.catId)
    const sub = cat?.subs.find((s) => s.id === t.subId)
    if (parsed.category) {
      const catName = (cat?.name ?? '').toLowerCase()
      const subName = (sub?.name ?? '').toLowerCase()
      if (
        !catName.includes(parsed.category) &&
        !subName.includes(parsed.category)
      ) {
        return false
      }
    }
    if (!parsed.freeText) return true
    const haystack = [
      t.title,
      t.memo ?? '',
      cat?.name ?? '',
      sub?.name ?? '',
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(parsed.freeText)
  })
}
