import { describe, expect, it } from 'vitest'
import type { Category, PayPeriod, Transaction } from '../types'
import { getCategorySpent, getEffectiveB, getSpent, periodStats } from './budget'

const period: PayPeriod = {
  id: 'p1',
  start: '2026-05-01',
  end: '2026-05-15',
}

const billsCat: Category = {
  id: 'cat_bills',
  name: 'Bills',
  emoji: '🧾',
  color: '#0ea5e9',
  allowsSubs: true,
  subs: [
    { id: 'sub_rent', name: 'Rent', emoji: '🏠', color: '#0ea5e9' },
    { id: 'sub_water', name: 'Water', emoji: '💧', color: '#0284c7' },
  ],
}
const groceriesCat: Category = {
  id: 'cat_groceries',
  name: 'Groceries',
  emoji: '🛒',
  color: '#10b981',
  allowsSubs: false,
  subs: [],
}
const transferCat: Category = {
  id: 'cat_transfer',
  name: 'Transfer',
  emoji: '↔️',
  color: '#64748b',
  allowsSubs: false,
  isTransfer: true,
  subs: [],
}

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx',
  date: '2026-05-05',
  account: 'bank',
  title: 't',
  catId: groceriesCat.id,
  amount: 0,
  type: 'expense',
  ...overrides,
})

describe('getSpent', () => {
  it('counts expenses inside the period that match the cat/sub', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 50, catId: billsCat.id, subId: 'sub_rent' }),
      tx({ id: 'b', amount: 25, catId: billsCat.id, subId: 'sub_water' }),
      tx({ id: 'c', amount: 12, catId: groceriesCat.id }),
      tx({ id: 'd', amount: 99, date: '2026-04-30', catId: billsCat.id, subId: 'sub_rent' }),
    ]
    expect(getSpent(txs, period, 'cat_bills', 'sub_rent')).toBe(50)
    expect(getSpent(txs, period, 'cat_bills', 'sub_water')).toBe(25)
    expect(getSpent(txs, period, 'cat_groceries')).toBe(12)
  })

  it('excludes skipped transactions and non-expense types', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 10, type: 'income' }),
      tx({ id: 'b', amount: 10, type: 'neutral' }),
      tx({ id: 'c', amount: 10, skipped: true }),
      tx({ id: 'd', amount: 5 }),
    ]
    expect(getSpent(txs, period, groceriesCat.id)).toBe(5)
  })

  it('uses split breakdowns instead of the parent catId when present', () => {
    const txs: Transaction[] = [
      tx({
        id: 'a',
        amount: 100,
        catId: 'cat_other', // parent catId is irrelevant when splits exist
        splits: [
          { id: 's1', catId: groceriesCat.id, amount: 60 },
          { id: 's2', catId: billsCat.id, subId: 'sub_water', amount: 40 },
        ],
      }),
    ]
    expect(getSpent(txs, period, groceriesCat.id)).toBe(60)
    expect(getSpent(txs, period, 'cat_bills', 'sub_water')).toBe(40)
    expect(getSpent(txs, period, 'cat_other')).toBe(0)
  })
})

describe('getCategorySpent', () => {
  it('does not double-count Bills with subs', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 1000, catId: billsCat.id, subId: 'sub_rent' }),
      tx({ id: 'b', amount: 50, catId: billsCat.id, subId: 'sub_water' }),
    ]
    expect(getCategorySpent(txs, period, billsCat)).toBe(1050)
  })

  it('rolls direct-on-parent spending into the parent', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 25, catId: billsCat.id }), // no sub
      tx({ id: 'b', amount: 75, catId: billsCat.id, subId: 'sub_rent' }),
    ]
    expect(getCategorySpent(txs, period, billsCat)).toBe(100)
  })
})

describe('getEffectiveB', () => {
  it('takes the larger of manual parent and summed subs', () => {
    const budgets = {
      [period.id]: {
        [billsCat.id]: 200, // manual parent
        [`${billsCat.id}/sub_rent`]: 100,
        [`${billsCat.id}/sub_water`]: 50,
      },
    }
    expect(getEffectiveB(budgets, billsCat, period.id).effective).toBe(200)

    const budgets2 = {
      [period.id]: {
        [billsCat.id]: 50,
        [`${billsCat.id}/sub_rent`]: 100,
        [`${billsCat.id}/sub_water`]: 50,
      },
    }
    const r2 = getEffectiveB(budgets2, billsCat, period.id)
    expect(r2.effective).toBe(150)
    expect(r2.isAuto).toBe(true)
  })
})

describe('periodStats', () => {
  it('excludes transfer categories from income and expense totals', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 1000, type: 'income', catId: 'cat_income' }),
      tx({ id: 'b', amount: 200, type: 'expense', catId: groceriesCat.id }),
      tx({ id: 'c', amount: 500, type: 'expense', catId: transferCat.id }),
      tx({ id: 'd', amount: 500, type: 'income', catId: transferCat.id }),
    ]
    const s = periodStats(txs, period, [], [transferCat])
    expect(s.income).toBe(1000)
    expect(s.expenses).toBe(200)
    expect(s.net).toBe(800)
  })

  it('respects the account filter', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', amount: 50, account: 'bank' }),
      tx({ id: 'b', amount: 70, account: 'credit' }),
    ]
    expect(periodStats(txs, period, ['bank']).expenses).toBe(50)
    expect(periodStats(txs, period, ['credit']).expenses).toBe(70)
  })
})
