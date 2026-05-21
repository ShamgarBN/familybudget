import type { AppState, Category, PayPeriod, Transaction, BudgetMap } from '../types'
import { budgetKey } from '../types'
import { withinPeriod } from './payPeriods'

/** Floor for "is over" comparisons to avoid float noise. */
export const EPS = 0.005

/** Spending for a (catId, subId?) within a pay period — account-agnostic. */
export function getSpent(
  txs: Transaction[],
  pp: PayPeriod,
  catId: string,
  subId?: string,
): number {
  let total = 0
  for (const t of txs) {
    if (t.type !== 'expense') continue
    if (t.skipped) continue
    if (!withinPeriod(t.date, pp)) continue

    if (t.splits && t.splits.length > 0) {
      for (const s of t.splits) {
        if (s.catId !== catId) continue
        if (subId === undefined && s.subId !== undefined) continue
        if (subId !== undefined && s.subId !== subId) continue
        total += s.amount
      }
    } else {
      if (t.catId !== catId) continue
      if (subId === undefined && t.subId !== undefined) continue
      if (subId !== undefined && t.subId !== subId) continue
      total += t.amount
    }
  }
  return total
}

/** Manual budget value (or 0) for a key in a period. */
export function getB(
  budgets: BudgetMap,
  ppId: string,
  catId: string,
  subId?: string,
): number {
  return budgets?.[ppId]?.[budgetKey(catId, subId)] ?? 0
}

/**
 * Effective budget for a category in a period.
 * - If category allows subs: effective = max(manual_parent, sum_of_sub_effectives)
 * - Else: effective = manual budget (no rollover, by user choice)
 */
export function getEffectiveB(
  budgets: BudgetMap,
  cat: Category,
  ppId: string,
): { effective: number; auto: number; isAuto: boolean } {
  const manual = getB(budgets, ppId, cat.id)
  if (cat.allowsSubs && cat.subs.length > 0) {
    const auto = cat.subs.reduce(
      (sum, s) => sum + getB(budgets, ppId, cat.id, s.id),
      0,
    )
    if (manual > auto) return { effective: manual, auto, isAuto: false }
    return { effective: auto, auto, isAuto: true }
  }
  return { effective: manual, auto: 0, isAuto: false }
}

/** Sum of category spending across the whole period for "Total spent". */
export function getCategorySpent(
  txs: Transaction[],
  pp: PayPeriod,
  cat: Category,
): number {
  if (cat.allowsSubs && cat.subs.length > 0) {
    let total = getSpent(txs, pp, cat.id) // direct (no sub) spend
    for (const s of cat.subs) total += getSpent(txs, pp, cat.id, s.id)
    return total
  }
  return getSpent(txs, pp, cat.id)
}

/** Aggregate ledger metrics for header pills. */
export function periodStats(
  txs: Transaction[],
  pp: PayPeriod,
  accountFilter: string[],
  categories: Category[] = [],
): { income: number; expenses: number; net: number } {
  let income = 0
  let expenses = 0
  const transferIds = new Set(categories.filter((c) => c.isTransfer).map((c) => c.id))
  for (const t of txs) {
    if (t.skipped) continue
    if (!withinPeriod(t.date, pp)) continue
    if (accountFilter.length && !accountFilter.includes(t.account)) continue
    if (transferIds.has(t.catId)) continue
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expenses += t.amount
  }
  return { income, expenses, net: income - expenses }
}
