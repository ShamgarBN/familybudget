import { v4 as uuid } from 'uuid'
import type { RecurringOwnedField, RecurringRule, Transaction } from '../types'
import { fromISO, toISO } from './dates'
import { addDays, addMonths, addYears } from 'date-fns'

const HORIZON_YEARS = 2

/**
 * Apply rule-owned fields to an existing instance, but skip any field the
 * user has explicitly overridden. This lets manual edits in the ledger
 * survive subsequent regen passes (e.g. on app reload).
 */
function applyRuleToExisting(
  existing: Transaction,
  rule: RecurringRule,
): Transaction {
  const overrides = new Set<RecurringOwnedField>(existing.overrides ?? [])
  const next: Transaction = { ...existing, recurringId: rule.id }
  if (!overrides.has('account')) next.account = rule.account
  if (!overrides.has('title')) next.title = rule.title
  if (!overrides.has('memo')) next.memo = rule.memo
  if (!overrides.has('catId')) next.catId = rule.catId
  if (!overrides.has('subId')) next.subId = rule.subId
  if (!overrides.has('amount')) next.amount = rule.amount
  if (!overrides.has('type')) next.type = rule.type
  return next
}

/**
 * Generate transaction instances from a recurring rule across a 2-year horizon.
 *
 * Existing transactions linked to this rule keep instance-specific state like
 * id/date/cleared and any user-overridden rule fields, while non-overridden
 * fields refresh from the rule.
 *
 * Skipped instances are preserved verbatim — we never resurrect a skipped row
 * or replace it with a fresh one, so a vacation-paycheck stays gone even after
 * a regen pass. Paused rules still keep their existing instances but stop
 * producing new dates.
 */
export function generateInstances(
  rule: RecurringRule,
  existing: Transaction[],
  horizonEndISO?: string,
): Transaction[] {
  const horizon = horizonEndISO ?? toISO(addYears(new Date(), HORIZON_YEARS))
  const stop = rule.endDate && rule.endDate < horizon ? rule.endDate : horizon

  const existingByDate = new Map<string, Transaction>()
  for (const t of existing) {
    if (t.recurringId === rule.id) existingByDate.set(t.date, t)
  }

  const out: Transaction[] = []
  let cursor = rule.startDate
  let safety = 0
  const todayISO = toISO(new Date())
  while (cursor <= stop && safety < 1000) {
    safety++
    const existingTx = existingByDate.get(cursor)
    if (existingTx) {
      // Skipped instances pass through untouched — never re-attach the rule's
      // current values or they'd silently revive on the next regen.
      if (existingTx.skipped) out.push(existingTx)
      else out.push(applyRuleToExisting(existingTx, rule))
    } else if (!rule.paused || cursor <= todayISO) {
      // While paused, only retain instances that already existed; do not seed
      // new future ones. Past dates still get filled in for first-time rules
      // so a brand-new rule paused on day 1 still has its history.
      out.push({
        id: uuid(),
        date: cursor,
        account: rule.account,
        title: rule.title,
        memo: rule.memo,
        catId: rule.catId,
        subId: rule.subId,
        amount: rule.amount,
        type: rule.type,
        recurringId: rule.id,
        cleared: false,
      })
    }
    cursor = stepDate(cursor, rule)
  }
  return out
}

function stepDate(iso: string, rule: RecurringRule): string {
  const d = fromISO(iso)
  switch (rule.frequency) {
    case 'weekly':
      return toISO(addDays(d, 7))
    case 'biweekly':
      return toISO(addDays(d, 14))
    case 'monthly':
      return toISO(addMonths(d, 1))
    case 'biannually':
      return toISO(addMonths(d, 6))
    case 'yearly':
      return toISO(addYears(d, 1))
    case 'custom':
      return toISO(addDays(d, rule.customDays ?? 30))
  }
}

/**
 * Replace all transactions tied to a rule with a freshly generated set.
 * Used when a rule is created or edited.
 *
 * Returns the same `allTx` reference when nothing changes — that lets the
 * store skip pushing an undo snapshot and writing to localStorage on every
 * app launch, which would otherwise pollute the undo history with no-ops.
 */
export function syncRuleTransactions(
  rule: RecurringRule,
  allTx: Transaction[],
): Transaction[] {
  const others = allTx.filter((t) => t.recurringId !== rule.id)
  const existing = allTx.filter((t) => t.recurringId === rule.id)
  const generated = generateInstances(rule, existing)

  if (generated.length === existing.length) {
    const byId = new Map(existing.map((t) => [t.id, t]))
    let identical = true
    for (const g of generated) {
      const prev = byId.get(g.id)
      if (!prev || !sameTransaction(prev, g)) {
        identical = false
        break
      }
    }
    if (identical) return allTx
  }

  return [...others, ...generated]
}

/** Shallow-compare two transactions on every field that regen could touch. */
function sameTransaction(a: Transaction, b: Transaction): boolean {
  if (a.id !== b.id) return false
  if (a.date !== b.date) return false
  if (a.account !== b.account) return false
  if (a.title !== b.title) return false
  if ((a.memo ?? '') !== (b.memo ?? '')) return false
  if (a.catId !== b.catId) return false
  if ((a.subId ?? '') !== (b.subId ?? '')) return false
  if (a.amount !== b.amount) return false
  if (a.type !== b.type) return false
  if (!!a.cleared !== !!b.cleared) return false
  if (a.recurringId !== b.recurringId) return false
  const ao = a.overrides ?? []
  const bo = b.overrides ?? []
  if (ao.length !== bo.length) return false
  for (let i = 0; i < ao.length; i++) if (ao[i] !== bo[i]) return false
  return true
}
