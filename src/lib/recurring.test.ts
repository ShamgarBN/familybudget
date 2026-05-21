import { describe, expect, it } from 'vitest'
import type { RecurringRule, Transaction } from '../types'
import { generateInstances, syncRuleTransactions } from './recurring'

const baseRule: RecurringRule = {
  id: 'r1',
  title: 'Cisco Payroll',
  amount: 3380,
  type: 'income',
  catId: 'cat_income',
  account: 'bank',
  frequency: 'biweekly',
  startDate: '2026-01-02',
  endDate: '2026-02-13',
}

describe('generateInstances', () => {
  it('produces a row per cadence step from start through endDate inclusive', () => {
    const out = generateInstances(baseRule, [])
    const dates = out.map((t) => t.date)
    expect(dates).toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13'])
    for (const t of out) {
      expect(t.amount).toBe(3380)
      expect(t.type).toBe('income')
      expect(t.recurringId).toBe('r1')
    }
  })

  it('preserves manually overridden fields when re-syncing', () => {
    const existing: Transaction[] = [
      {
        id: 'tx1',
        date: '2026-01-02',
        account: 'bank',
        title: 'CUSTOM TITLE',
        catId: 'cat_income',
        amount: 4000,
        type: 'income',
        recurringId: 'r1',
        overrides: ['title', 'amount'],
      },
    ]
    const out = generateInstances(baseRule, existing)
    const first = out.find((t) => t.date === '2026-01-02')!
    expect(first.id).toBe('tx1')
    expect(first.title).toBe('CUSTOM TITLE')
    expect(first.amount).toBe(4000)
    // Non-overridden fields still refresh from the rule.
    expect(first.account).toBe('bank')
    expect(first.type).toBe('income')
  })

  it('keeps skipped instances intact and does not re-create them', () => {
    const existing: Transaction[] = [
      {
        id: 'sk',
        date: '2026-01-16',
        account: 'bank',
        title: 'Cisco Payroll',
        catId: 'cat_income',
        amount: 3380,
        type: 'income',
        recurringId: 'r1',
        skipped: true,
      },
    ]
    const out = generateInstances(baseRule, existing)
    const matching = out.filter((t) => t.date === '2026-01-16')
    expect(matching).toHaveLength(1)
    expect(matching[0].skipped).toBe(true)
    expect(matching[0].id).toBe('sk')
  })

  it('does not seed future instances when paused', () => {
    const paused: RecurringRule = {
      ...baseRule,
      paused: true,
      startDate: '2099-01-01',
      endDate: '2099-03-01',
    }
    const out = generateInstances(paused, [])
    expect(out).toEqual([])
  })
})

describe('syncRuleTransactions', () => {
  it('returns the same array reference when nothing changes', () => {
    // Seed once so the second pass has matching instances.
    const empty: Transaction[] = []
    const first = syncRuleTransactions(baseRule, empty)
    const again = syncRuleTransactions(baseRule, first)
    expect(again).toBe(first)
  })

  it('produces a new reference when the rule itself drifts from the existing rows', () => {
    const seeded = syncRuleTransactions(baseRule, [])
    const bumped: RecurringRule = { ...baseRule, amount: 5000 }
    const out = syncRuleTransactions(bumped, seeded)
    expect(out).not.toBe(seeded)
    expect(out.every((t) => t.amount === 5000)).toBe(true)
  })

  it('preserves overrides on existing rows even when the rule drifts', () => {
    const seeded = syncRuleTransactions(baseRule, [])
    const overridden: Transaction[] = seeded.map((t) =>
      t.date === '2026-01-02'
        ? { ...t, amount: 4000, overrides: ['amount'] }
        : t,
    )
    const bumped: RecurringRule = { ...baseRule, amount: 5000 }
    const out = syncRuleTransactions(bumped, overridden)
    expect(out.find((t) => t.date === '2026-01-02')?.amount).toBe(4000)
    // Other dates should follow the new rule amount.
    expect(out.find((t) => t.date === '2026-01-16')?.amount).toBe(5000)
  })
})
