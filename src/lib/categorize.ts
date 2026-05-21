import type { Category, ManualRulesMap, Transaction } from '../types'
import {
  CREDIT_CARD_CATEGORY_ID,
  INCOME_CATEGORY_ID,
  TRANSFER_CATEGORY_ID,
} from '../store/defaults'

export interface Suggestion {
  catId: string
  subId?: string
}

/** Source of a categorization decision. Useful for UI badges. */
export type SuggestionSource = 'manual-rule' | 'history' | 'keyword'

export interface SuggestionWithSource extends Suggestion {
  source: SuggestionSource
}

interface Rule {
  match: RegExp
  catId: string
  subId?: string
}

/**
 * Built-in keyword rules. Each rule references the *default* category/subcategory IDs
 * defined in `store/defaults.ts`. If a user has deleted a default category, the rule
 * is skipped at categorize time.
 */
const RULES: Rule[] = [
  // Credit-card payments (route to the dedicated Credit Card category — balance impact only).
  { match: /\b(apple\s*card|capital\s*one(?:\s*card)?|chase\s*card|amex|american\s*express|discover\s*card|citi\s*card|visa\s*pmt|mastercard\s*pmt|credit\s*card\s*(payment|pmt|autopay)|card\s*payment|cc\s*pmt|cardmember\s*serv)\b/i, catId: CREDIT_CARD_CATEGORY_ID },
  // Internal transfers (savings, between own accounts, etc.)
  { match: /\b(transfer|ach\s*deposit|internet\s*transfer|payment\s*to|payment\s*from|autopay|thank\s*you|balance\s*payment)\b/i, catId: TRANSFER_CATEGORY_ID },

  // Bills > Rent / Mortgage
  { match: /\b(rent|mortgage|hoa|wells\s*fargo\s*home|chase\s*home|quicken\s*loans|rocket\s*mortgage)\b/i, catId: 'cat_bills', subId: 'sub_rent' },
  // Bills > Electric
  { match: /\b(duke\s*energy|dominion(?!\s*post)|appalachian\s*power|edison|pg\s*&?\s*e|con\s*ed|nipsco|austin\s*energy|electric\s*bill|power\s*bill)\b/i, catId: 'cat_bills', subId: 'sub_electric' },
  // Bills > Water
  { match: /\b(water\s*(bill|util|company|works)|sewer|aqua\s*amer|wssc)\b/i, catId: 'cat_bills', subId: 'sub_water' },
  // Bills > Internet
  { match: /\b(comcast|xfinity|spectrum\s*int|cox\s*comm|frontier\s*comm|google\s*fiber|verizon\s*fios|att\s*internet|fiber\s*int)\b/i, catId: 'cat_bills', subId: 'sub_internet' },
  // Bills > Phone
  { match: /\b(verizon\s*wir|t-?mobile|tmobile|at\s*&?\s*t\s*(mob|wir)?|sprint|mint\s*mobile|google\s*fi|cricket\s*wir)\b/i, catId: 'cat_bills', subId: 'sub_phone' },
  // Bills > Insurance
  { match: /\b(geico|state\s*farm|progressive(?!\s*field)|allstate|liberty\s*mutual|nationwide\s*ins|usaa\s*ins|farmers\s*ins|metlife|insurance)\b/i, catId: 'cat_bills', subId: 'sub_insurance' },
  // Bills > Subscriptions  (streaming + recurring software/services)
  { match: /\b(netflix|spotify|hulu|disney\s*plus|disneyplus|disney\+|apple\.com\/bill|apple\s*music|youtube\s*(premium|tv|music)|prime\s*video|hbo\s*max|max\s*-\s*hbo|paramount\+|peacock|adobe|dropbox|notion|chatgpt|openai|github|figma|substack|nytimes|wsj|the\s*athletic|patreon|audible|kindle\s*unlim)\b/i, catId: 'cat_bills', subId: 'sub_subscriptions' },

  // Groceries
  { match: /\b(trader\s*joe|kroger|whole\s*foods|publix|wegmans|aldi|safeway|harris\s*teeter|food\s*lion|stop\s*&?\s*shop|sprouts|fresh\s*market|grocer(y|ies)|albertsons|giant\s*food|h-?e-?b|meijer|king\s*soopers|fred\s*meyer)\b/i, catId: 'cat_groceries' },

  // Eating Out & Entertainment
  { match: /\b(starbucks|chipotle|mcdonald|panera|chick-?fil-?a|domino|pizza|sushi|taco|wendy|burger\s*king|subway|dunkin|cafe|coffee|cold\s*stone|shake\s*shack|five\s*guys|smoothie|juice|in-?n-?out|raising\s*cane|popeyes|kfc|arby|sonic|jack\s*in\s*the\s*box|qdoba|moe'?s|noodles)\b/i, catId: 'cat_eatout' },
  { match: /\b(restaurant|bistro|grill|kitchen|tavern|bar\s*&|brewing|brewery|pub|wine\s*bar|cantina|trattoria|steakhouse)\b/i, catId: 'cat_eatout' },
  { match: /\b(doordash|uber\s*eats|ubereats|grubhub|postmates|seamless|drizly|caviar|toast\s*tab|chownow)\b/i, catId: 'cat_eatout' },
  { match: /\b(amc|regal|cinemark|fandango|stub\s*hub|stubhub|live\s*nation|ticketmaster|movie|cinema|theater|concert|broadway)\b/i, catId: 'cat_eatout' },

  // Shopping
  { match: /\b(amazon|amzn|target|walmart|wal-?mart|costco|sam'?s\s*club|best\s*buy|macy|nordstrom|kohl|tj\s*maxx|tjmaxx|marshalls|home\s*goods|homegoods|etsy|ebay|nike|adidas|under\s*armour|lululemon|gap|old\s*navy|banana\s*republic|j\.?\s*crew|sephora|ulta|bath\s*&\s*body)\b/i, catId: 'cat_shopping' },

  // Car & Driving
  { match: /\b(shell(?!\s*ridge)|exxon|chevron|mobil|bp\s|valero|sunoco|wawa|sheetz|gas\s*station|gasoline|fuel|7-?eleven|circle\s*k|speedway|costco\s*gas)\b/i, catId: 'cat_car' },
  { match: /\b(uber(?!\s*eats)|lyft|parking|toll|dmv|ezpass|sun\s*pass|jiffy\s*lube|auto\s*zone|advance\s*auto|firestone|tire|midas|car\s*wash|enterprise\s*rent|hertz|avis)\b/i, catId: 'cat_car' },

  // Home & Office
  { match: /\b(home\s*depot|lowes|lowe'?s|ikea|wayfair|menards|ace\s*hardware|hardware|staples|office\s*depot|office\s*max|crate\s*&\s*barrel|west\s*elm|pottery\s*barn)\b/i, catId: 'cat_home' },

  // Boone (pet)
  { match: /\b(petco|petsmart|chewy|pet\s*supplies|veterinar|vet\s*hospital|animal\s*hospital|banfield|pet\s*hotel)\b/i, catId: 'cat_boone' },

  // Giving / Tithe
  { match: /\b(donat(e|ion)|tithe|charity|red\s*cross|salvation\s*army|goodwill|gofundme|kickstarter|indiegogo|\bchurch\b|saint\s|st\.\s)\b/i, catId: 'cat_giving' },

  // Income (when amount sign already says income, this just routes the catId)
  { match: /\b(payroll|salary|direct\s*deposit|paycheck|reimburs|tax\s*refund|interest\s*payment|dividend|venmo\s*from|zelle\s*from)\b/i, catId: INCOME_CATEGORY_ID },
]

/**
 * Build a short, stable "merchant signature" used as the key for both learned
 * rules and inferred history. Kept short so it generalizes across instances of
 * the same merchant ("WEGMANS WAKE FOREST 145 11/30 …" and "WEGMANS WAKE FOREST
 * 145 12/03 …" both → "wegmans"). Stop-words are aggressively filtered to
 * avoid bank-noise tokens dominating the signature.
 */
export function signature(title: string, memo?: string): string {
  const text = `${title} ${memo ?? ''}`.toLowerCase()
  const tokens = text.match(/[a-z]+/g) ?? []
  const stop = STOP_WORDS
  const filtered = tokens.filter((t) => t.length >= 3 && !stop.has(t))
  return filtered.slice(0, 2).join(' ')
}

const STOP_WORDS = new Set<string>([
  // Articles & generic
  'the', 'and', 'llc', 'inc', 'corp', 'company', 'co', 'of', 'at', 'for', 'from', 'to', 'com', 'net', 'org',
  // Bank / processor noise
  'pos', 'ach', 'card', 'tst', 'square', 'paypal', 'venmo', 'zelle',
  'des', 'tran', 'transaction', 'purchase', 'banking', 'mobile', 'online', 'web',
  'check', 'electronic', 'pmt', 'payment', 'authorized', 'auth', 'recurring',
  'usa', 'usd', 'ind', 'indn',
  // Direction / role tokens that are meaningless on their own
  'debit', 'credit',
  // Generic geographic noise — keep short list to avoid stripping real merchants
  'wake', 'forest', 'raleigh', 'durham', 'cary',
  'ave', 'blvd', 'street',
])

/** Map of merchant signature → most-frequent category, learned from existing transactions. */
export type LearnedMap = Map<string, Suggestion>

export function buildLearned(transactions: Transaction[]): LearnedMap {
  const counts = new Map<string, Map<string, number>>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    if (t.catId === INCOME_CATEGORY_ID) continue
    const sig = signature(t.title, t.memo)
    if (!sig) continue
    const key = `${t.catId}:${t.subId ?? ''}`
    if (!counts.has(sig)) counts.set(sig, new Map())
    const inner = counts.get(sig)!
    inner.set(key, (inner.get(key) ?? 0) + 1)
  }
  const learned: LearnedMap = new Map()
  for (const [sig, inner] of counts) {
    let bestKey = ''
    let bestN = 0
    for (const [k, n] of inner) {
      if (n > bestN) {
        bestKey = k
        bestN = n
      }
    }
    // Require at least two confirmations before "learning" — avoids one-off noise.
    if (bestN >= 2) {
      const [catId, sub] = bestKey.split(':')
      learned.set(sig, { catId, subId: sub || undefined })
    }
  }
  return learned
}

/** Returns true if the cat (and sub, if specified) actually exists in the user's category list. */
function suggestionExists(s: Suggestion, cats: Category[]): boolean {
  const cat = cats.find((c) => c.id === s.catId)
  if (!cat) return false
  if (!s.subId) return true
  return !!cat.subs.find((x) => x.id === s.subId)
}

/**
 * Pick a category for a row of imported / existing data.
 *
 * Priority (high → low):
 *   1. Explicit user-trained rule for this merchant signature (`rules`).
 *   2. Inferred-from-history (signatures with ≥ 2 confirmations in `learned`).
 *   3. Built-in keyword rules.
 *   4. null  → caller falls back (e.g. to "Other").
 */
export function categorize(
  title: string,
  memo: string | undefined,
  cats: Category[],
  learned: LearnedMap,
  rules: ManualRulesMap,
): SuggestionWithSource | null {
  const text = `${title} ${memo ?? ''}`.trim()
  if (!text) return null

  const sig = signature(title, memo)

  if (sig && rules[sig]) {
    const r = rules[sig]
    const guess: Suggestion = { catId: r.catId, subId: r.subId }
    if (suggestionExists(guess, cats)) return { ...guess, source: 'manual-rule' }
    // Parent fallback if the trained sub no longer exists.
    if (r.subId && cats.find((c) => c.id === r.catId)) {
      return { catId: r.catId, source: 'manual-rule' }
    }
  }

  if (sig && learned.has(sig)) {
    const guess = learned.get(sig)!
    if (suggestionExists(guess, cats)) return { ...guess, source: 'history' }
  }

  for (const rule of RULES) {
    if (rule.match.test(text)) {
      const guess: Suggestion = { catId: rule.catId, subId: rule.subId }
      if (suggestionExists(guess, cats)) return { ...guess, source: 'keyword' }
      if (rule.subId && cats.find((c) => c.id === rule.catId)) {
        return { catId: rule.catId, source: 'keyword' }
      }
    }
  }
  return null
}

/**
 * Re-categorize an existing transaction. Returns a `Partial<Transaction>` patch
 * (or null if no change needed).
 *
 * Type correction is asymmetric: we'll flip an *expense* to income when the
 * categorizer strongly suggests Income (e.g. payroll keyword), but we never
 * downgrade a positive-sign transaction to expense — that would mis-classify
 * legitimate refunds where the parser already correctly read a positive amount.
 */
export function recategorizeTx(
  t: Transaction,
  cats: Category[],
  learned: LearnedMap,
  rules: ManualRulesMap,
): Partial<Transaction> | null {
  if (t.type === 'neutral') return null
  const guess = categorize(t.title, t.memo, cats, learned, rules)
  if (!guess) return null
  const patch: Partial<Transaction> = {}
  if (guess.catId !== t.catId) patch.catId = guess.catId
  if (guess.subId !== t.subId) patch.subId = guess.subId

  const guessIsIncome = guess.catId === INCOME_CATEGORY_ID
  if (guessIsIncome && t.type === 'expense') patch.type = 'income'

  return Object.keys(patch).length > 0 ? patch : null
}

/** Update a `learnedRules` map from a manual category change on a transaction. */
export function trainRule(
  rules: ManualRulesMap,
  tx: Pick<Transaction, 'title' | 'memo'>,
  catId: string,
  subId: string | undefined,
): ManualRulesMap {
  const sig = signature(tx.title, tx.memo)
  if (!sig) return rules
  const existing = rules[sig]
  return {
    ...rules,
    [sig]: {
      catId,
      subId,
      updatedAt: Date.now(),
      hits: (existing?.hits ?? 0) + 1,
    },
  }
}
