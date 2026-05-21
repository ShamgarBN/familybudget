import { describe, expect, it } from 'vitest'
import type { Category, ManualRulesMap, Transaction } from '../types'
import {
  buildLearned,
  categorize,
  recategorizeTx,
  signature,
  trainRule,
} from './categorize'
import {
  CREDIT_CARD_CATEGORY_ID,
  INCOME_CATEGORY_ID,
  TRANSFER_CATEGORY_ID,
} from '../store/defaults'

const cats: Category[] = [
  { id: INCOME_CATEGORY_ID, name: 'Income', emoji: '💼', color: '#16a34a', allowsSubs: false, isIncome: true, subs: [] },
  { id: TRANSFER_CATEGORY_ID, name: 'Transfer', emoji: '↔️', color: '#64748b', allowsSubs: false, isTransfer: true, subs: [] },
  { id: CREDIT_CARD_CATEGORY_ID, name: 'Credit Card', emoji: '💳', color: '#a855f7', allowsSubs: false, isTransfer: true, subs: [] },
  {
    id: 'cat_bills', name: 'Bills', emoji: '🧾', color: '#0ea5e9', allowsSubs: true,
    subs: [
      { id: 'sub_rent', name: 'Rent', emoji: '🏠', color: '#0ea5e9' },
      { id: 'sub_subscriptions', name: 'Subs', emoji: '🔁', color: '#ec4899' },
    ],
  },
  { id: 'cat_groceries', name: 'Groceries', emoji: '🛒', color: '#10b981', allowsSubs: false, subs: [] },
  { id: 'cat_eatout', name: 'Eating Out', emoji: '🍔', color: '#f97316', allowsSubs: false, subs: [] },
]

describe('signature', () => {
  it('strips bank noise tokens and returns the merchant root', () => {
    expect(signature('POS WEGMANS WAKE FOREST 145')).toContain('wegmans')
    expect(signature('STARBUCKS 12345', 'PURCHASE')).toContain('starbucks')
    expect(signature('  ')).toBe('')
  })

  it('is stable across nearly identical descriptions', () => {
    expect(signature('Wegmans Wake Forest 145 12/03/26')).toBe(
      signature('WEGMANS WAKE FOREST 145 12/05/26'),
    )
  })
})

describe('categorize', () => {
  it('routes Apple Card payments to the Credit Card category', () => {
    const r = categorize('APPLE CARD PAYMENT', undefined, cats, new Map(), {})
    expect(r?.catId).toBe(CREDIT_CARD_CATEGORY_ID)
  })

  it('routes generic transfers to the Transfer category', () => {
    const r = categorize('Internet Transfer To Savings', undefined, cats, new Map(), {})
    expect(r?.catId).toBe(TRANSFER_CATEGORY_ID)
  })

  it('uses Bills>Subscriptions for streaming services', () => {
    const r = categorize('Netflix.com', undefined, cats, new Map(), {})
    expect(r?.catId).toBe('cat_bills')
    expect(r?.subId).toBe('sub_subscriptions')
  })

  it('prefers a user-trained rule over keyword fallback', () => {
    const trained: ManualRulesMap = {}
    const updated = trainRule(trained, { title: 'WEGMANS WAKE FOREST 145' }, 'cat_eatout', undefined)
    const r = categorize('WEGMANS WAKE FOREST 145', undefined, cats, new Map(), updated)
    expect(r?.source).toBe('manual-rule')
    expect(r?.catId).toBe('cat_eatout')
  })

  it('returns null when there are no usable hints', () => {
    const r = categorize('zzzz qqqq', undefined, cats, new Map(), {})
    expect(r).toBeNull()
  })
})

describe('recategorizeTx', () => {
  const baseTx = (over: Partial<Transaction> = {}): Transaction => ({
    id: 'a',
    date: '2026-05-01',
    account: 'bank',
    title: 'Wegmans',
    catId: 'cat_other',
    amount: 50,
    type: 'expense',
    ...over,
  })

  it('flips expense → income when categorizer suggests Income', () => {
    const t = baseTx({ title: 'Cisco Payroll' })
    const patch = recategorizeTx(t, cats, new Map(), {})
    expect(patch?.catId).toBe(INCOME_CATEGORY_ID)
    expect(patch?.type).toBe('income')
  })

  it('does NOT downgrade income → expense', () => {
    const t = baseTx({ title: 'Wegmans Refund', type: 'income', amount: 12 })
    const patch = recategorizeTx(t, cats, new Map(), {})
    // Even though Wegmans is normally Groceries (an expense category), we
    // refuse to flip a positive transaction to expense.
    expect(patch?.type).toBeUndefined()
  })

  it('returns null for neutral transactions', () => {
    const t = baseTx({ type: 'neutral' })
    expect(recategorizeTx(t, cats, new Map(), {})).toBeNull()
  })
})

describe('buildLearned', () => {
  it('requires at least two confirmations before learning a signature', () => {
    const txs: Transaction[] = [
      { id: '1', date: '2026-01-01', account: 'bank', title: 'New Place', catId: 'cat_eatout', amount: 10, type: 'expense' },
    ]
    expect(buildLearned(txs).has(signature('New Place'))).toBe(false)

    const both: Transaction[] = [
      ...txs,
      { id: '2', date: '2026-01-02', account: 'bank', title: 'New Place', catId: 'cat_eatout', amount: 12, type: 'expense' },
    ]
    expect(buildLearned(both).get(signature('New Place'))?.catId).toBe('cat_eatout')
  })
})
