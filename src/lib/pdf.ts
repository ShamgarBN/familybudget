import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type {
  AccountDef,
  Category,
  PayPeriod,
  Transaction,
  BudgetMap,
} from '../types'
import { fmtMid, periodLabel } from './dates'
import { withinPeriod } from './payPeriods'
import { getCategorySpent, getEffectiveB } from './budget'
import { formatMoney } from '../components/ui/Money'
import { sortedCategories } from '../store/selectors'

interface Args {
  period: PayPeriod
  transactions: Transaction[]
  categories: Category[]
  accounts: AccountDef[]
  budgets: BudgetMap
}

export function downloadPeriodReport({
  period,
  transactions,
  categories,
  accounts,
  budgets,
}: Args): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Niemann Family Finances', 40, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(period.label || periodLabel(period.start, period.end), 40, 68)
  doc.setTextColor(110)
  doc.text(`${fmtMid(period.start)} – ${fmtMid(period.end)}`, 40, 84)
  doc.setTextColor(0)

  /* Period summary */
  let income = 0
  let expense = 0
  const periodTx = transactions.filter((t) => withinPeriod(t.date, period))
  for (const t of periodTx) {
    const cat = categories.find((c) => c.id === t.catId)
    if (cat?.isTransfer) continue
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
  }
  const summaryY = 110
  doc.setFontSize(10)
  doc.text(`Income: ${formatMoney(income)}`, 40, summaryY)
  doc.text(`Expenses: ${formatMoney(expense)}`, 200, summaryY)
  doc.text(`Net: ${formatMoney(income - expense)}`, 360, summaryY)

  /* Category budget table — includes Transfer/Credit Card so users can see
   * planned vs actual money movement, just like the in-app Budget Breakdown. */
  const cats = sortedCategories(categories).filter((c) => !c.isIncome)
  const budgetRows = cats.map((c) => {
    const eff = getEffectiveB(budgets, c, period.id).effective
    const spent = getCategorySpent(transactions, period, c)
    const remaining = eff - spent
    return [
      `${c.emoji} ${c.name}`,
      formatMoney(eff),
      formatMoney(spent),
      formatMoney(remaining),
    ]
  })
  autoTable(doc, {
    startY: 130,
    head: [['Category', 'Budget', 'Spent', 'Remaining']],
    body: budgetRows,
    headStyles: { fillColor: [59, 126, 255], halign: 'left' },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    styles: { fontSize: 9, cellPadding: 4 },
  })

  /* Transactions table */
  const txRows = periodTx
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const cat = categories.find((c) => c.id === t.catId)
      const acc = accounts.find((a) => a.id === t.account)
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '~'
      return [
        t.date,
        acc?.label ?? t.account,
        t.title,
        cat?.name ?? '',
        sign,
        formatMoney(t.amount),
      ]
    })

  autoTable(doc, {
    head: [['Date', 'Account', 'Title', 'Category', '', 'Amount']],
    body: txRows,
    headStyles: { fillColor: [59, 126, 255] },
    columnStyles: {
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'right' },
    },
    styles: { fontSize: 8, cellPadding: 3 },
  })

  doc.save(`niemann-${period.start}-to-${period.end}.pdf`)
}

interface RangeArgs {
  startISO: string
  endISO: string
  transactions: Transaction[]
  categories: Category[]
  accounts: AccountDef[]
}

/**
 * Multi-period PDF report for a free-form date range. Aggregates spending by
 * category across the range and emits a transaction list grouped by month.
 * Skipped and transfer-category rows are excluded from totals so the report
 * matches the in-app stats.
 */
export function downloadRangeReport({
  startISO,
  endISO,
  transactions,
  categories,
  accounts,
}: RangeArgs): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('Niemann Family Finances', 40, 50)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(`Date range report`, 40, 68)
  doc.setTextColor(110)
  doc.text(`${fmtMid(startISO)} – ${fmtMid(endISO)}`, 40, 84)
  doc.setTextColor(0)

  const transferIds = new Set(
    categories.filter((c) => c.isTransfer).map((c) => c.id),
  )
  const inRange = (t: Transaction) =>
    !t.skipped && t.date >= startISO && t.date <= endISO

  let income = 0
  let expense = 0
  const byCat = new Map<string, number>()
  const rangeTx = transactions.filter(inRange)
  for (const t of rangeTx) {
    if (transferIds.has(t.catId)) continue
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') {
      expense += t.amount
      byCat.set(t.catId, (byCat.get(t.catId) ?? 0) + t.amount)
    }
  }

  doc.setFontSize(10)
  doc.text(`Income: ${formatMoney(income)}`, 40, 110)
  doc.text(`Expenses: ${formatMoney(expense)}`, 200, 110)
  doc.text(`Net: ${formatMoney(income - expense)}`, 360, 110)

  const sortedCats = sortedCategories(categories).filter((c) => !c.isIncome)
  const catRows = sortedCats
    .map((c) => {
      const spent = byCat.get(c.id) ?? 0
      return spent > 0 ? [`${c.emoji} ${c.name}`, formatMoney(spent)] : null
    })
    .filter((r): r is string[] => r !== null)

  autoTable(doc, {
    startY: 130,
    head: [['Category', 'Spent']],
    body: catRows,
    headStyles: { fillColor: [59, 126, 255], halign: 'left' },
    columnStyles: { 1: { halign: 'right' } },
    styles: { fontSize: 9, cellPadding: 4 },
  })

  const txRows = rangeTx
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const cat = categories.find((c) => c.id === t.catId)
      const acc = accounts.find((a) => a.id === t.account)
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '~'
      return [
        t.date,
        acc?.label ?? t.account,
        t.title,
        cat?.name ?? '',
        sign,
        formatMoney(t.amount),
      ]
    })

  autoTable(doc, {
    head: [['Date', 'Account', 'Title', 'Category', '', 'Amount']],
    body: txRows,
    headStyles: { fillColor: [59, 126, 255] },
    columnStyles: {
      4: { halign: 'center', cellWidth: 18 },
      5: { halign: 'right' },
    },
    styles: { fontSize: 8, cellPadding: 3 },
  })

  doc.save(`niemann-${startISO}-to-${endISO}.pdf`)
}
