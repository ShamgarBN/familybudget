import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import { formatMoney } from './ui/Money'
import { getCategorySpent, getEffectiveB } from '../lib/budget'
import { sortedPeriods } from '../lib/payPeriods'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

type Mode = 'trend' | 'variance'

const monthKey = (iso: string) => iso.slice(0, 7) // YYYY-MM
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

/**
 * Insights panel: switch between a 12-month income vs expense trend and a
 * budget-vs-actual variance bar for the most recent few pay periods.
 *
 * Both views respect the global account filter so the user sees numbers that
 * line up with the rest of the dashboard.
 */
export function TrendsCard() {
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const periods = useStore((s) => s.payPeriods)
  const budgets = useStore((s) => s.budgets)
  const ui = useStore((s) => s.ui)
  const [mode, setMode] = useState<Mode>('trend')

  /* -------- 12-month trend -------- */
  const trendData = useMemo(() => {
    const transferIds = new Set(
      categories.filter((c) => c.isTransfer).map((c) => c.id),
    )

    const today = new Date()
    const months: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const income = new Map<string, number>()
    const expense = new Map<string, number>()
    for (const m of months) {
      income.set(m, 0)
      expense.set(m, 0)
    }

    for (const t of transactions) {
      if (t.skipped) continue
      if (transferIds.has(t.catId)) continue
      if (ui.accountFilter.length && !ui.accountFilter.includes(t.account)) continue
      const k = monthKey(t.date)
      if (!income.has(k)) continue
      if (t.type === 'income') income.set(k, (income.get(k) ?? 0) + t.amount)
      else if (t.type === 'expense')
        expense.set(k, (expense.get(k) ?? 0) + t.amount)
    }

    return {
      labels: months.map(monthLabel),
      income: months.map((m) => income.get(m) ?? 0),
      expense: months.map((m) => expense.get(m) ?? 0),
      net: months.map((m) => (income.get(m) ?? 0) - (expense.get(m) ?? 0)),
    }
  }, [transactions, categories, ui.accountFilter])

  /* -------- Budget vs actual (last up-to-6 pay periods) -------- */
  const varianceData = useMemo(() => {
    const sorted = sortedPeriods(periods).slice(-6)
    const cats = sortedCategories(categories).filter((c) => !c.isIncome)
    const grouped = sorted.map((p) => {
      let budget = 0
      let actual = 0
      for (const c of cats) {
        const eff = getEffectiveB(budgets, c, p.id).effective
        if (eff > 0) budget += eff
        actual += getCategorySpent(transactions, p, c)
      }
      return {
        label: p.label || `${p.start.slice(5)}—${p.end.slice(5)}`,
        budget,
        actual,
      }
    })
    return grouped
  }, [periods, categories, budgets, transactions])

  const trendChart = {
    labels: trendData.labels,
    datasets: [
      {
        label: 'Income',
        data: trendData.income,
        backgroundColor: '#16a34a',
        borderRadius: 4,
        stack: 'flow',
      },
      {
        label: 'Expenses',
        data: trendData.expense.map((v) => -v),
        backgroundColor: '#dc2626',
        borderRadius: 4,
        stack: 'flow',
      },
    ],
  }

  const varianceChart = {
    labels: varianceData.map((d) => d.label),
    datasets: [
      {
        label: 'Budgeted',
        data: varianceData.map((d) => d.budget),
        backgroundColor: '#94a3b8',
        borderRadius: 4,
      },
      {
        label: 'Actual',
        data: varianceData.map((d) => d.actual),
        backgroundColor: '#3b7eff',
        borderRadius: 4,
      },
    ],
  }

  const trendOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            `${ctx.dataset.label}: ${formatMoney(Math.abs(Number(ctx.raw)))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        ticks: {
          callback: (v) => formatMoney(Math.abs(Number(v))),
          font: { size: 10 },
        },
        grid: { color: '#f1f5f9' },
      },
    },
  }

  const varianceOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Number(ctx.raw))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        ticks: {
          callback: (v) => formatMoney(Number(v)),
          font: { size: 10 },
        },
        grid: { color: '#f1f5f9' },
      },
    },
  }

  const isEmpty =
    mode === 'trend'
      ? trendData.income.every((v) => v === 0) &&
        trendData.expense.every((v) => v === 0)
      : varianceData.length === 0 ||
        varianceData.every((d) => d.budget === 0 && d.actual === 0)

  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold">Insights</h2>
          <p className="text-xs text-muted mt-0.5">
            {mode === 'trend'
              ? 'Income vs. expenses, last 12 months'
              : 'Budget vs. actual, recent pay periods'}
          </p>
        </div>
        <div className="flex rounded-md border border-line bg-slate-50 p-0.5">
          <button
            className={`px-2.5 py-1 text-xs rounded ${mode === 'trend' ? 'bg-white shadow-sm font-medium' : 'text-muted'}`}
            onClick={() => setMode('trend')}
          >
            Trend
          </button>
          <button
            className={`px-2.5 py-1 text-xs rounded ${mode === 'variance' ? 'bg-white shadow-sm font-medium' : 'text-muted'}`}
            onClick={() => setMode('variance')}
          >
            Variance
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-[220px]">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            Add transactions and budgets to see {mode === 'trend' ? 'trends' : 'variance'}.
          </div>
        ) : mode === 'trend' ? (
          <Bar data={trendChart} options={trendOptions} />
        ) : (
          <Bar data={varianceChart} options={varianceOptions} />
        )}
      </div>

      {mode === 'trend' && !isEmpty && (
        <p className="text-xs text-muted mt-2">
          Avg net (last 12 mo):{' '}
          <span className="num font-medium text-ink">
            {formatMoney(
              trendData.net.reduce((a, b) => a + b, 0) /
                Math.max(1, trendData.net.length),
            )}
          </span>
        </p>
      )}
    </div>
  )
}
