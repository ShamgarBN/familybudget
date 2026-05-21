import { v4 as uuid } from 'uuid'
import type { AccountDef, AppState, Category } from '../types'

export const DEFAULT_ACCOUNTS: AccountDef[] = [
  { id: 'bank', label: 'Bank Account', color: '#3b7eff' },
  { id: 'credit', label: 'Credit Card', color: '#a855f7' },
  { id: 'savings', label: 'Savings', color: '#16a34a' },
]

/** Stable IDs for default categories so the JSON imports/exports stay portable. */
const id = (slug: string) => `cat_${slug}`
const sid = (slug: string) => `sub_${slug}`

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: id('income'),
    name: 'Income',
    emoji: '💼',
    color: '#16a34a',
    allowsSubs: false,
    isIncome: true,
    subs: [],
  },
  {
    id: id('transfer'),
    name: 'Transfer',
    emoji: '↔️',
    color: '#64748b',
    allowsSubs: false,
    isTransfer: true,
    subs: [],
  },
  {
    id: id('creditcard'),
    name: 'Credit Card',
    emoji: '💳',
    color: '#a855f7',
    allowsSubs: false,
    isTransfer: true,
    subs: [],
  },
  {
    id: id('bills'),
    name: 'Bills',
    emoji: '🧾',
    color: '#0ea5e9',
    allowsSubs: true,
    subs: [
      { id: sid('rent'), name: 'Rent / Mortgage', emoji: '🏠', color: '#0ea5e9' },
      { id: sid('electric'), name: 'Electric', emoji: '💡', color: '#f59e0b' },
      { id: sid('water'), name: 'Water', emoji: '💧', color: '#0284c7' },
      { id: sid('internet'), name: 'Internet', emoji: '📶', color: '#6366f1' },
      { id: sid('phone'), name: 'Phone', emoji: '📱', color: '#8b5cf6' },
      { id: sid('insurance'), name: 'Insurance', emoji: '🛡️', color: '#475569' },
      { id: sid('subscriptions'), name: 'Subscriptions', emoji: '🔁', color: '#ec4899' },
    ],
  },
  { id: id('giving'), name: 'Giving', emoji: '🤝', color: '#22c55e', allowsSubs: false, subs: [] },
  { id: id('groceries'), name: 'Groceries', emoji: '🛒', color: '#10b981', allowsSubs: false, subs: [] },
  { id: id('shopping'), name: 'Shopping', emoji: '🛍️', color: '#f43f5e', allowsSubs: false, subs: [] },
  { id: id('car'), name: 'Car & Driving', emoji: '🚗', color: '#3b82f6', allowsSubs: false, subs: [] },
  { id: id('home'), name: 'Home & Office', emoji: '🏡', color: '#7c3aed', allowsSubs: false, subs: [] },
  { id: id('eatout'), name: 'Eating Out & Entertainment', emoji: '🍔', color: '#f97316', allowsSubs: false, subs: [] },
  { id: id('rhys'), name: 'Rhys', emoji: '🧒', color: '#0ea5e9', allowsSubs: false, subs: [] },
  { id: id('sophia'), name: 'Sophia', emoji: '👧', color: '#ec4899', allowsSubs: false, subs: [] },
  { id: id('sarah'), name: 'Sarah Spending', emoji: '👩', color: '#a855f7', allowsSubs: false, subs: [] },
  { id: id('snstudio'), name: 'SNStudio', emoji: '🎨', color: '#06b6d4', allowsSubs: false, subs: [] },
  { id: id('ben'), name: 'Ben Spending', emoji: '👨', color: '#2563eb', allowsSubs: false, subs: [] },
  { id: id('makeforlife'), name: 'Make For Life', emoji: '🛠️', color: '#84cc16', allowsSubs: false, subs: [] },
  { id: id('tablegrain'), name: 'Table & Grain', emoji: '🍞', color: '#d97706', allowsSubs: false, subs: [] },
  { id: id('boone'), name: 'Boone', emoji: '🐶', color: '#ca8a04', allowsSubs: false, subs: [] },
  { id: id('christmas'), name: 'Christmas', emoji: '🎄', color: '#16a34a', allowsSubs: false, subs: [] },
  { id: id('other'), name: 'Other', emoji: '📌', color: '#64748b', allowsSubs: false, subs: [] },
]

export const INCOME_CATEGORY_ID = id('income')
export const TRANSFER_CATEGORY_ID = id('transfer')
export const CREDIT_CARD_CATEGORY_ID = id('creditcard')
export const BILLS_CATEGORY_ID = id('bills')

/**
 * Schema version. Bump this whenever you change the on-disk shape of `AppState`
 * in a way that older data should be migrated into. Every bump must add a
 * matching entry to MIGRATIONS below.
 *
 *   1 → initial release (V1 launch)
 *   2 → added Credit Card category, renamed Christmas, account starting balances,
 *       transaction `flagged` field, recurring `paused` / instance `skipped`.
 */
export const SCHEMA_VERSION = 2

export function createDefaultState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a, startingBalance: 0 })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, subs: [...c.subs] })),
    transactions: [],
    recurring: [],
    payPeriods: [],
    budgets: {},
    learnedRules: {},
    settings: {
      payPeriodFrequency: 'biweekly',
      payPeriodAnchor: new Date().toISOString().slice(0, 10),
      theme: 'system',
    },
    ui: {
      collapsedPeriods: [],
      openBudgets: [],
      accountFilter: [],
      donutFilter: null,
      search: '',
    },
  }
}

/** Migration applied when schemaVersion ≤ 1 → 2. */
function migrateV1toV2(state: AppState): AppState {
  const renamedCats = state.categories.map((c) => {
    // Old default name was "Christmas & Transfer"; we now route transfers
    // through the dedicated Transfer category, so Christmas stands alone.
    if (c.id === id('christmas') && c.name === 'Christmas & Transfer') {
      return { ...c, name: 'Christmas' }
    }
    return c
  })
  const accountsWithStarting = state.accounts.map((a) => ({
    ...a,
    startingBalance: a.startingBalance ?? 0,
  }))
  const settingsWithTheme = {
    ...state.settings,
    theme: state.settings.theme ?? 'system',
  }
  return {
    ...state,
    categories: renamedCats,
    accounts: accountsWithStarting,
    settings: settingsWithTheme,
  }
}

type Migration = (state: AppState) => AppState
const MIGRATIONS: Record<number, Migration> = {
  // Key = source version. Result moves the state up by one schema version.
  1: migrateV1toV2,
}

/** Run any pending migrations and merge new defaults into a saved state. */
export function mergeNewDefaults(saved: AppState): AppState {
  let state = saved
  let v = state.schemaVersion ?? 1

  while (v < SCHEMA_VERSION) {
    const migrate = MIGRATIONS[v]
    if (!migrate) break
    state = migrate(state)
    v += 1
  }
  state = { ...state, schemaVersion: SCHEMA_VERSION }

  const existingIds = new Set(state.categories.map((c) => c.id))
  const additions = DEFAULT_CATEGORIES.filter((c) => !existingIds.has(c.id))
  if (additions.length > 0) {
    state = {
      ...state,
      categories: [
        ...state.categories,
        ...additions.map((c) => ({ ...c, subs: [...c.subs] })),
      ],
    }
  }
  return state
}
