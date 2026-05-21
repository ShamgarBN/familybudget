export type AccountKind = 'bank' | 'credit' | 'savings'

export interface AccountDef {
  id: AccountKind
  label: string
  color: string
  /**
   * Real account balance the day before the earliest transaction in this app.
   * Used to anchor the running balance so users don't have to enter a
   * synthetic "Beginning balance" income transaction when importing CSVs.
   */
  startingBalance?: number
}

export interface Subcategory {
  id: string
  name: string
  emoji: string
  color: string
}

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  /** Whether this category is allowed to have subcategories. Defaults to true only for Bills. */
  allowsSubs: boolean
  /** Marks the category as the income bucket — excluded from spending and donut. */
  isIncome?: boolean
  /** Marks internal money movement — impacts balances but is excluded from budgets/spending charts. */
  isTransfer?: boolean
  subs: Subcategory[]
}

export type TxType = 'expense' | 'income' | 'neutral'

/** A split allocation across multiple categories. */
export interface SplitPart {
  id: string
  catId: string
  subId?: string
  amount: number
  note?: string
}

/**
 * Fields a recurring rule owns. Editing any of these on a generated
 * instance "detaches" that field from the rule so the override survives
 * future regen passes.
 */
export type RecurringOwnedField =
  | 'title'
  | 'memo'
  | 'amount'
  | 'type'
  | 'catId'
  | 'subId'
  | 'account'

export interface Transaction {
  id: string
  /** ISO yyyy-mm-dd */
  date: string
  account: AccountKind
  title: string
  memo?: string
  catId: string
  subId?: string
  /** Always positive; sign is implied by `type`. */
  amount: number
  type: TxType
  cleared?: boolean
  /** Source recurring rule id (if generated from one) */
  recurringId?: string
  /** Optional split — if present, total of split parts must equal `amount`. */
  splits?: SplitPart[]
  /**
   * Field names the user has manually edited on this instance. When the
   * parent recurring rule is re-synced, these fields are preserved
   * instead of being reset to the rule's value.
   */
  overrides?: RecurringOwnedField[]
  /** User-flagged for review/follow-up. Surfaced as a star icon in the ledger. */
  flagged?: boolean
  /**
   * Recurring instance the user explicitly skipped (e.g. paycheck during
   * unpaid leave). Skipped instances stay in storage so future regen passes
   * don't re-create them, but are hidden from the ledger and excluded from
   * budgets/projections.
   */
  skipped?: boolean
}

export type RecurringFrequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'biannually'
  | 'yearly'
  | 'custom'

export interface RecurringRule {
  id: string
  title: string
  amount: number
  type: TxType
  catId: string
  subId?: string
  account: AccountKind
  frequency: RecurringFrequency
  /** Days between instances when frequency = custom. */
  customDays?: number
  startDate: string // ISO
  endDate?: string // ISO, optional
  memo?: string
  /**
   * If true, no new instances will be regenerated. Existing past instances
   * stay in the ledger so historical totals are unaffected.
   */
  paused?: boolean
}

export interface PayPeriod {
  id: string
  /** ISO yyyy-mm-dd inclusive */
  start: string
  /** ISO yyyy-mm-dd inclusive */
  end: string
  /** Optional custom label override */
  label?: string
}

export type PayPeriodFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface Settings {
  /** How auto-generated pay periods are sized. */
  payPeriodFrequency: PayPeriodFrequency
  /** Anchor date used to seed bi-weekly/weekly pay periods. */
  payPeriodAnchor: string
  /** Color theme preference. */
  theme?: ThemePreference
}

/** Budget storage: ppId -> catId|catId/subId -> amount */
export type BudgetMap = Record<string, Record<string, number>>

/** A merchant rule the user has explicitly trained by changing a transaction's category. */
export interface ManualRule {
  catId: string
  subId?: string
  /** ms since epoch — most recent training timestamp. */
  updatedAt: number
  /** Number of times the user has confirmed this signature → category mapping. */
  hits: number
}

/** Map of merchant signature → trained rule. */
export type ManualRulesMap = Record<string, ManualRule>

export interface UIState {
  /** Pay period IDs that are collapsed in the ledger. */
  collapsedPeriods: string[]
  /** Pay period IDs whose budget breakdowns are expanded. */
  openBudgets: string[]
  /** Currently active account filters. Empty = all. */
  accountFilter: AccountKind[]
  /** Current donut category filter (catId). Null = all. */
  donutFilter: string | null
  /** Current free-text search. */
  search: string
}

export interface AppState {
  schemaVersion: number
  accounts: AccountDef[]
  categories: Category[]
  transactions: Transaction[]
  recurring: RecurringRule[]
  payPeriods: PayPeriod[]
  budgets: BudgetMap
  /** Trained merchant rules — populated when user manually re-categorizes a transaction. */
  learnedRules: ManualRulesMap
  settings: Settings
  ui: UIState
}

/** Key used to store budget for a category (with optional subcategory). */
export const budgetKey = (catId: string, subId?: string) =>
  subId ? `${catId}/${subId}` : catId
