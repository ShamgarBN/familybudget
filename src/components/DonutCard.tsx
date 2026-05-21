import { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
  type ChartOptions,
} from 'chart.js'
import { useStore } from '../store/store'
import { findCategory } from '../store/selectors'
import { formatMoney } from './ui/Money'
import clsx from 'clsx'

ChartJS.register(ArcElement, Tooltip, Legend)

export function DonutCard() {
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const accounts = useStore((s) => s.accounts)
  const periods = useStore((s) => s.payPeriods)
  const ui = useStore((s) => s.ui)
  const setDonutFilter = useStore((s) => s.setDonutFilter)

  const filterLabel = useMemo(() => {
    if (ui.accountFilter.length === 0) return 'All accounts'
    return ui.accountFilter
      .map((a) => accounts.find((x) => x.id === a)?.label ?? a)
      .join(' + ')
  }, [ui.accountFilter, accounts])

  /**
   * Restrict spending mix to transactions that fall inside one of the user's
   * defined pay periods — i.e. what is actually visible in the ledger. This
   * keeps "Other" honest: stray imported rows outside the budget window were
   * historically counted here even though they never appeared as ledger items.
   *
   * Categories with subs (e.g. Bills) are broken out per subcategory so the
   * chart shows exactly where the money went.
   */
  const data = useMemo(() => {
    const sortedRanges = periods
      .map((p) => ({ start: p.start, end: p.end }))
      .sort((a, b) => a.start.localeCompare(b.start))

    const inAnyPeriod = (date: string): boolean => {
      for (const r of sortedRanges) {
        if (date < r.start) return false
        if (date <= r.end) return true
      }
      return false
    }

    const keyFor = (catId: string, subId?: string): string => {
      const cat = findCategory(categories, catId)
      if (cat?.allowsSubs && subId) return `${catId}:${subId}`
      return catId
    }

    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      if (ui.accountFilter.length && !ui.accountFilter.includes(t.account)) continue
      if (sortedRanges.length > 0 && !inAnyPeriod(t.date)) continue

      if (t.splits && t.splits.length > 0) {
        for (const s of t.splits) {
          const cat = findCategory(categories, s.catId)
          if (cat?.isTransfer) continue
          const k = keyFor(s.catId, s.subId)
          totals.set(k, (totals.get(k) ?? 0) + s.amount)
        }
      } else {
        const cat = findCategory(categories, t.catId)
        if (cat?.isTransfer) continue
        const k = keyFor(t.catId, t.subId)
        totals.set(k, (totals.get(k) ?? 0) + t.amount)
      }
    }

    type Entry = {
      id: string
      total: number
      name: string
      emoji: string
      color: string
    }
    const entries: Entry[] = []
    for (const [key, total] of totals) {
      if (total <= 0) continue
      const sepIdx = key.indexOf(':')
      if (sepIdx >= 0) {
        const catId = key.slice(0, sepIdx)
        const subId = key.slice(sepIdx + 1)
        const cat = findCategory(categories, catId)
        if (!cat) continue
        const sub = cat.subs.find((s) => s.id === subId)
        if (!sub) {
          // Sub was deleted — fall back to the parent.
          entries.push({
            id: catId,
            total,
            name: cat.name,
            emoji: cat.emoji,
            color: cat.color,
          })
          continue
        }
        entries.push({
          id: key,
          total,
          name: `${cat.name} › ${sub.name}`,
          emoji: sub.emoji,
          color: sub.color,
        })
      } else {
        const cat = findCategory(categories, key)
        if (!cat) continue
        entries.push({
          id: key,
          total,
          name: cat.name,
          emoji: cat.emoji,
          color: cat.color,
        })
      }
    }
    return entries.sort((a, b) => b.total - a.total)
  }, [transactions, categories, periods, ui.accountFilter])

  const chartData = {
    labels: data.map((d) => `${d.emoji} ${d.name}`),
    datasets: [
      {
        data: data.map((d) => d.total),
        backgroundColor: data.map((d) => d.color),
        borderColor: '#fff',
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  }

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${formatMoney(Number(ctx.raw))}`,
        },
      },
    },
    cutout: '62%',
  }

  const grandTotal = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="card p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="text-base font-semibold">Spending Mix</h2>
          <p className="text-xs text-muted mt-0.5">{filterLabel}</p>
        </div>
        <div className="text-right">
          <p className="label">Total</p>
          <p className="text-lg font-semibold num">{formatMoney(grandTotal)}</p>
        </div>
      </div>

      <div className="relative h-56 my-3">
        {data.length > 0 ? (
          <Doughnut data={chartData} options={options} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted text-sm">
            Add expenses to see your spending mix
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-1 -mr-1">
        {data.map((d) => {
          const isActive = ui.donutFilter === d.id
          return (
            <button
              key={d.id}
              onClick={() => setDonutFilter(isActive ? null : d.id)}
              className={clsx(
                'flex items-center justify-between gap-2 px-2 py-1 rounded-md text-sm transition w-full',
                isActive
                  ? 'bg-accent/10 ring-1 ring-accent/40'
                  : 'hover:bg-slate-50',
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: d.color }}
                />
                <span className="truncate">
                  {d.emoji} {d.name}
                </span>
              </span>
              <span className="num text-muted">{formatMoney(d.total)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
