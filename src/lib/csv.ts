import Papa from 'papaparse'
import type { AccountKind, Category, Transaction, TxType } from '../types'
import { todayISO } from './dates'

/**
 * Parse a money-ish string into a signed number.
 * Handles:
 *   "$1,234.56"       →  1234.56
 *   "(45.00)"         →  -45.00      ← parens-style negative
 *   "1234.56-"        →  -1234.56    ← trailing minus
 *   "+12.34"          →  12.34
 *   ""                →  0
 */
export const cleanMoney = (raw: unknown): number => {
  let s = String(raw ?? '').trim()
  if (!s) return 0
  let neg = false
  if (/^\(.*\)$/.test(s)) {
    neg = true
    s = s.slice(1, -1)
  }
  if (/-\s*$/.test(s)) {
    neg = true
    s = s.replace(/-\s*$/, '')
  }
  s = s.replace(/[\$,"\s]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  if (s.startsWith('-')) {
    neg = !neg
    s = s.slice(1)
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return neg ? -Math.abs(n) : Math.abs(n)
}

const toISODate = (raw: unknown): string => {
  const s = String(raw ?? '').trim()
  if (!s) return todayISO()
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const yyyy = y.length === 2 ? `20${y}` : y
    return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const dash = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (dash) {
    const [, y, m, d] = dash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const dt = new Date(t)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
      dt.getDate(),
    ).padStart(2, '0')}`
  }
  return todayISO()
}

interface ParsedRow {
  date: string
  title: string
  memo?: string
  amount: number
  type: TxType
}

interface ColumnMap {
  date: number
  title: number
  amount?: number
  debit?: number
  credit?: number
  type?: number
  memo?: number
  merchant?: number
  balance?: number
}

const findIdx = (lc: string[], re: RegExp, exclude?: RegExp): number =>
  lc.findIndex((h) => (exclude && exclude.test(h) ? false : re.test(h)))

const isAvoidColumn = (header: string): boolean =>
  /balance|avail|running|posted|category|account/i.test(header)

/**
 * STRICT header detection. The real transaction header must mention BOTH a date
 * concept and an amount-ish concept (Amount/Debit/Credit/Withdrawal/Deposit/Paid).
 * This filters out summary/metadata blocks that banks like to prepend (e.g.
 * `Description,,Summary Amt.` followed by `Beginning balance / Total credits / ...`).
 */
const looksLikeHeaderRowStrict = (row: string[]): boolean => {
  const joined = row.join(' ').toLowerCase()
  if (!joined.trim()) return false
  const hasDate = /\b(date|posted|transaction\s*date)\b/.test(joined)
  const hasAmtish = /\b(amount|amt|debit|credit|withdrawal|deposit|paid)\b/.test(joined)
  return hasDate && hasAmtish
}

/** Loose fallback for unusual exports that don't include a "date" keyword. */
const looksLikeHeaderRowLoose = (row: string[]): boolean => {
  const joined = row.join(' ').toLowerCase()
  if (!joined.trim()) return false
  return /\b(date|amount|description|merchant|memo|debit|credit|withdrawal|deposit|title|payee)\b/i.test(
    joined,
  )
}

const findHeaderRow = (data: string[][]): number => {
  const limit = Math.min(20, data.length)
  for (let i = 0; i < limit; i++) {
    if (looksLikeHeaderRowStrict(data[i])) return i
  }
  for (let i = 0; i < limit; i++) {
    if (looksLikeHeaderRowLoose(data[i])) return i
  }
  return 0
}

/** Rows in the body that look like repeated headers — skip them. */
const isInDataHeader = (row: string[]): boolean => looksLikeHeaderRowStrict(row)

const isBalanceOpener = (title: string): boolean =>
  /^(beginning|opening|starting|previous|prior)\s+balance/i.test(title.trim())

const detectBankColumns = (headers: string[]): ColumnMap => {
  const lc = headers.map((h) => String(h ?? '').toLowerCase().trim())
  const dateIdx = findIdx(lc, /(^|\b)(date|posted|transaction\s*date)\b/)
  const debitIdx = findIdx(lc, /\b(debit|withdrawal|paid\s*out|amount\s*out)\b/)
  const creditIdx = findIdx(lc, /\b(credit|deposit|paid\s*in|amount\s*in)\b/)
  const titleIdx = findIdx(lc, /\b(description|title|name|payee|merchant|details|narrative)\b/)
  const memoIdx = findIdx(lc, /\b(memo|notes?)\b/)
  const typeIdx = findIdx(lc, /\b(type|tran(?:saction)?\s*type|action)\b/)
  const balanceIdx = findIdx(lc, /\b(running\s*bal|ledger\s*bal|balance|bal\.?)\b/)

  // Amount column: avoid balance/running/avail/posted/category/account.
  let amountIdx = -1
  for (let j = 0; j < lc.length; j++) {
    if (j === debitIdx || j === creditIdx) continue
    if (isAvoidColumn(lc[j])) continue
    if (/(^|\b)(amount|amt|summary|value)\b/i.test(lc[j])) {
      amountIdx = j
      break
    }
  }

  return {
    date: dateIdx >= 0 ? dateIdx : 0,
    title: titleIdx >= 0 ? titleIdx : 1,
    amount: amountIdx >= 0 ? amountIdx : undefined,
    debit: debitIdx >= 0 ? debitIdx : undefined,
    credit: creditIdx >= 0 ? creditIdx : undefined,
    type: typeIdx >= 0 ? typeIdx : undefined,
    memo: memoIdx >= 0 ? memoIdx : undefined,
    balance: balanceIdx >= 0 ? balanceIdx : undefined,
  }
}

const detectCreditColumns = (headers: string[]): ColumnMap => {
  const lc = headers.map((h) => String(h ?? '').toLowerCase().trim())
  const dateIdx = findIdx(lc, /(^|\b)(date|posted|transaction\s*date)\b/)
  const titleIdx = findIdx(lc, /\b(description|details|narrative|title)\b/)
  const merchantIdx = findIdx(lc, /\b(merchant|payee|name)\b/)
  const memoIdx = findIdx(lc, /\b(memo|notes?|category)\b/)
  const typeIdx = findIdx(lc, /\b(type|tran(?:saction)?\s*type)\b/)
  const debitIdx = findIdx(lc, /\b(debit|charge|purchase|sale|amount\s*out)\b/)
  const creditIdx = findIdx(lc, /\b(credit|payment|refund|return|amount\s*in)\b/)

  let amountIdx = -1
  for (let j = lc.length - 1; j >= 0; j--) {
    if (j === debitIdx || j === creditIdx) continue
    if (isAvoidColumn(lc[j])) continue
    if (/(^|\b)(amount|amt|charge|value)\b/i.test(lc[j])) {
      amountIdx = j
      break
    }
  }

  return {
    date: dateIdx >= 0 ? dateIdx : 0,
    title: titleIdx >= 0 ? titleIdx : 2,
    merchant: merchantIdx >= 0 ? merchantIdx : 3,
    amount: amountIdx >= 0 ? amountIdx : undefined,
    debit: debitIdx >= 0 ? debitIdx : undefined,
    credit: creditIdx >= 0 ? creditIdx : undefined,
    type: typeIdx >= 0 ? typeIdx : undefined,
    memo: memoIdx >= 0 ? memoIdx : undefined,
  }
}

/** Last-resort: find the rightmost numeric column whose header is not "balance"-like. */
const lastNumericIdx = (row: string[], headers: string[]): number => {
  for (let j = row.length - 1; j >= 0; j--) {
    const head = String(headers[j] ?? '').toLowerCase()
    if (isAvoidColumn(head)) continue
    if (cleanMoney(row[j]) !== 0) return j
  }
  return -1
}

const adjustSignByType = (raw: string, amount: number): number => {
  const tval = String(raw ?? '').toLowerCase()
  if (!tval) return amount
  if (/(debit|withdraw|sale|purchase|charge|fee|payment\s*to|expense|out\b)/.test(tval)) {
    return -Math.abs(amount)
  }
  if (/(credit|deposit|refund|payment\s*from|interest|reward|return|in\b)/.test(tval)) {
    return Math.abs(amount)
  }
  return amount
}

const creditTypeFromText = (raw: unknown): TxType | null => {
  const tval = String(raw ?? '').toLowerCase()
  if (!tval) return null

  // Paying a credit-card bill is movement into the card account. Keep the
  // positive balance impact, and let categorization route it to Transfer so it
  // stays out of Income/Expense reporting.
  if (/(payment|autopay|thank\s*you|transfer|balance\s*payment)/.test(tval)) {
    return 'income'
  }

  if (/(purchase|sale|charge|debit|fee|interest|cash\s*advance)/.test(tval)) {
    return 'expense'
  }

  if (/(refund|return|credit|reward|adjustment|reversal)/.test(tval)) {
    return 'income'
  }

  return null
}

const classifyCreditAmount = (amount: number, row: string[], cols: ColumnMap): TxType => {
  const fromType = cols.type !== undefined ? creditTypeFromText(row[cols.type]) : null
  if (fromType) return fromType

  if (cols.debit !== undefined && Math.abs(cleanMoney(row[cols.debit])) > 0) return 'expense'
  if (cols.credit !== undefined && Math.abs(cleanMoney(row[cols.credit])) > 0) return 'income'

  // Apple Card exports positive purchases. Some banks export negative payments
  // or refunds. Without a Type/Debit/Credit column, use the sign as the best
  // available hint.
  return amount >= 0 ? 'expense' : 'income'
}

export function parseBankCsv(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  const { data } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (data.length < 2) return out
  const hdrIdx = findHeaderRow(data)
  const headers = data[hdrIdx].map((h) => String(h ?? '').trim())
  const cols = detectBankColumns(headers)

  for (let i = hdrIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 2) continue
    if (isInDataHeader(row)) continue

    const title = String(row[cols.title] ?? '').trim() || 'Untitled'
    const memo =
      cols.memo !== undefined ? String(row[cols.memo] ?? '').trim() || undefined : undefined

    let amt = 0
    if (cols.debit !== undefined && cols.credit !== undefined) {
      const d = Math.abs(cleanMoney(row[cols.debit]))
      const c = Math.abs(cleanMoney(row[cols.credit]))
      amt = c - d
    } else if (cols.amount !== undefined) {
      amt = cleanMoney(row[cols.amount])
      if (cols.type !== undefined) amt = adjustSignByType(row[cols.type], amt)
    } else {
      const j = lastNumericIdx(row, headers)
      if (j >= 0) amt = cleanMoney(row[j])
    }

    // Special case: a "Beginning balance"-style opener with empty Amount but a
    // non-zero Running Balance. Treat as an income transaction so the running
    // balance starts from the right place.
    if (amt === 0 && isBalanceOpener(title) && cols.balance !== undefined) {
      const bal = cleanMoney(row[cols.balance])
      if (bal !== 0) {
        out.push({
          date: toISODate(row[cols.date]),
          title,
          memo,
          amount: Math.abs(bal),
          type: bal < 0 ? 'expense' : 'income',
        })
      }
      continue
    }

    if (amt === 0) continue

    out.push({
      date: toISODate(row[cols.date]),
      title,
      memo,
      amount: Math.abs(amt),
      type: amt < 0 ? 'expense' : 'income',
    })
  }
  return out
}

export function parseCreditCsv(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  const { data } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (data.length < 2) return out
  const hdrIdx = findHeaderRow(data)
  const headers = data[hdrIdx].map((h) => String(h ?? '').trim())
  const cols = detectCreditColumns(headers)

  for (let i = hdrIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 2) continue
    if (isInDataHeader(row)) continue

    let amt = 0
    if (cols.debit !== undefined && cols.credit !== undefined) {
      const d = Math.abs(cleanMoney(row[cols.debit]))
      const c = Math.abs(cleanMoney(row[cols.credit]))
      amt = d || c
    } else if (cols.amount !== undefined) {
      amt = cleanMoney(row[cols.amount])
    } else {
      const j = lastNumericIdx(row, headers)
      if (j >= 0) amt = cleanMoney(row[j])
    }
    if (amt === 0) continue

    const titleA = String(row[cols.title] ?? '').trim()
    const titleB = String(row[cols.merchant ?? -1] ?? '').trim()
    const title = titleB || titleA || 'Untitled'
    const memo = titleA && titleB && titleA !== titleB ? titleA : undefined

    out.push({
      date: toISODate(row[cols.date]),
      title,
      memo,
      amount: Math.abs(amt),
      type: classifyCreditAmount(amt, row, cols),
    })
  }
  return out
}

export function parseSavingsCsv(text: string): ParsedRow[] {
  const out: ParsedRow[] = []
  const { data } = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  if (data.length < 2) return out
  const hdrIdx = findHeaderRow(data)
  const headers = data[hdrIdx].map((h) => String(h ?? '').trim())
  const cols = detectBankColumns(headers)

  for (let i = hdrIdx + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 2) continue
    if (isInDataHeader(row)) continue

    let amt = 0
    if (cols.debit !== undefined && cols.credit !== undefined) {
      const d = Math.abs(cleanMoney(row[cols.debit]))
      const c = Math.abs(cleanMoney(row[cols.credit]))
      amt = c - d
    } else if (cols.amount !== undefined) {
      amt = cleanMoney(row[cols.amount])
      if (cols.type !== undefined) amt = adjustSignByType(row[cols.type], amt)
    } else {
      const j = lastNumericIdx(row, headers)
      if (j >= 0) amt = cleanMoney(row[j])
    }
    if (amt === 0) continue

    out.push({
      date: toISODate(row[cols.date]),
      title: String(row[cols.title] ?? '').trim() || 'Untitled',
      amount: Math.abs(amt),
      type: amt < 0 ? 'expense' : 'income',
    })
  }
  return out
}

export function parseFor(account: AccountKind, text: string): ParsedRow[] {
  if (account === 'bank') return parseBankCsv(text)
  if (account === 'credit') return parseCreditCsv(text)
  return parseSavingsCsv(text)
}

export function rowsToTransactions(
  rows: ParsedRow[],
  account: AccountKind,
  resolveCat: (row: ParsedRow) => { catId: string; subId?: string },
): Omit<Transaction, 'id'>[] {
  return rows.map((r) => {
    const { catId, subId } = resolveCat(r)
    return {
      date: r.date,
      account,
      title: r.title,
      memo: r.memo,
      catId,
      subId,
      amount: r.amount,
      type: r.type,
      cleared: false,
    }
  })
}

/* ---------------- Export ---------------- */

interface ExportRow {
  Date: string
  Account: string
  Title: string
  Category: string
  Subcategory: string
  Type: string
  Amount: string
  Memo: string
  Cleared: string
  Flagged: string
  SplitOf: string
}

/**
 * Export the ledger as CSV. Split transactions are emitted as multiple rows
 * (one parent + one row per split part), all sharing the same `SplitOf`
 * identifier so users can trace splits in spreadsheet software. The parent
 * row's amount is the full transaction; child rows are negative-only / share
 * the parent's sign so re-importing keeps the math consistent.
 */
export function exportLedgerCsv(
  transactions: Transaction[],
  cats: Category[],
  accounts: { id: string; label: string }[],
): string {
  const findCat = (id: string) => cats.find((c) => c.id === id)
  const accountLabel = (id: string) => accounts.find((a) => a.id === id)?.label ?? id

  const rows: ExportRow[] = []
  for (const t of transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const cat = findCat(t.catId)
    const sub = cat?.subs.find((s) => s.id === t.subId)
    const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0
    const signed = sign * t.amount

    rows.push({
      Date: t.date,
      Account: accountLabel(t.account),
      Title: t.title,
      Category: cat?.name ?? '',
      Subcategory: sub?.name ?? '',
      Type: t.type,
      Amount: signed.toFixed(2),
      Memo: t.memo ?? '',
      Cleared: t.cleared ? 'yes' : 'no',
      Flagged: t.flagged ? 'yes' : 'no',
      SplitOf: t.splits && t.splits.length > 0 ? t.id : '',
    })
    if (t.splits && t.splits.length > 0) {
      for (const s of t.splits) {
        const sCat = findCat(s.catId)
        const sSub = sCat?.subs.find((x) => x.id === s.subId)
        rows.push({
          Date: t.date,
          Account: accountLabel(t.account),
          Title: `↳ ${t.title}`,
          Category: sCat?.name ?? '',
          Subcategory: sSub?.name ?? '',
          Type: t.type,
          Amount: (sign * s.amount).toFixed(2),
          Memo: s.note ?? '',
          Cleared: t.cleared ? 'yes' : 'no',
          Flagged: t.flagged ? 'yes' : 'no',
          SplitOf: t.id,
        })
      }
    }
  }
  return Papa.unparse(rows)
}
