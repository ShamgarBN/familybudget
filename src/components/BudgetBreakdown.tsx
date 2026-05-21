import { useMemo } from 'react'
import clsx from 'clsx'
import type { Category, PayPeriod } from '../types'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import { BILLS_CATEGORY_ID } from '../store/defaults'
import { EPS, getB, getCategorySpent, getEffectiveB, getSpent } from '../lib/budget'
import { Money, formatMoney } from './ui/Money'

interface Props {
  period: PayPeriod
}

export function BudgetBreakdown({ period }: Props) {
  const categories = useStore((s) => s.categories)
  const transactions = useStore((s) => s.transactions)
  const budgets = useStore((s) => s.budgets)
  const setBudget = useStore((s) => s.setBudget)

  /**
   * Show every non-income category — including Transfer / Credit Card so users
   * can budget money flow even though those don't count toward income/expense.
   */
  const cats = useMemo(
    () => sortedCategories(categories).filter((c) => !c.isIncome),
    [categories],
  )

  const bills = useMemo(
    () => cats.find((c) => c.id === BILLS_CATEGORY_ID),
    [cats],
  )
  const otherCats = useMemo(
    () => cats.filter((c) => c.id !== BILLS_CATEGORY_ID),
    [cats],
  )

  const totals = useMemo(() => {
    let totalBudget = 0
    let totalSpent = 0
    for (const c of cats) {
      const eff = getEffectiveB(budgets, c, period.id).effective
      totalBudget += eff
      totalSpent += getCategorySpent(transactions, period, c)
    }
    return { totalBudget, totalSpent }
  }, [cats, budgets, transactions, period])

  const renderCard = (c: Category, opts: { wide?: boolean } = {}) => {
    const { wide = false } = opts
    const eff = getEffectiveB(budgets, c, period.id)
    const spent = getCategorySpent(transactions, period, c)
    const manual = getB(budgets, period.id, c.id)
    const over = spent - eff.effective > EPS
    const pct = eff.effective > 0 ? Math.min(100, (spent / eff.effective) * 100) : 0
    const sortedSubs = [...c.subs].sort((a, b) => a.name.localeCompare(b.name))

    return (
      <div
        key={c.id}
        className={clsx(
          'rounded-lg border border-line bg-white p-3 flex flex-col gap-2',
          wide && 'lg:col-span-3 md:col-span-2',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">{c.emoji}</span>
            <span className="font-medium truncate">{c.name}</span>
            {c.isTransfer && (
              <span
                className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-muted"
                title="Affects account balance only — excluded from income & expense totals."
              >
                Balance only
              </span>
            )}
          </div>
          <div className="text-sm text-right">
            <Money value={spent} />
            <span className="text-muted mx-1">/</span>
            <Money
              value={eff.effective}
              className={clsx(eff.isAuto && 'text-accent')}
            />
          </div>
        </div>

        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={clsx('h-full transition-all', over ? 'bg-overspend' : 'bg-accent')}
            style={{
              width: `${over ? 100 : pct}%`,
              backgroundColor: over ? undefined : c.color,
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-xs">
          <span className={clsx(over ? 'text-overspend' : 'text-muted')}>
            {over
              ? `Over by ${formatMoney(spent - eff.effective)}`
              : eff.effective > 0
                ? `${formatMoney(eff.effective - spent)} left · ${Math.round(pct)}%`
                : 'No budget set'}
          </span>
          <label className="flex items-center gap-2 shrink-0">
            <span className="label">Budget</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input py-1 text-xs w-24"
              placeholder={eff.isAuto ? formatMoney(eff.auto) : '0.00'}
              value={manual || ''}
              onChange={(e) =>
                setBudget(period.id, c.id, parseFloat(e.target.value) || 0)
              }
            />
          </label>
        </div>
        {eff.isAuto && (
          <p className="text-[11px] text-accent -mt-1">
            Parent budget uses subcategory total ({formatMoney(eff.auto)}) unless
            Budget is set higher.
          </p>
        )}

        {c.allowsSubs && sortedSubs.length > 0 && (
          <div
            className={clsx(
              'mt-1 border-t border-line pt-2',
              wide
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5'
                : 'space-y-1.5',
            )}
          >
            {sortedSubs.map((s) => {
              const sb = getB(budgets, period.id, c.id, s.id)
              const sSpent = getSpent(transactions, period, c.id, s.id)
              const sOver = sSpent - sb > EPS && sb > 0
              const sPct = sb > 0 ? Math.min(100, (sSpent / sb) * 100) : 0
              return (
                <div key={s.id} className="flex items-center gap-2 text-xs">
                  <span className="w-5 text-center">{s.emoji}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="num">
                    {formatMoney(sSpent)}
                    <span className="text-muted mx-1">/</span>
                    {formatMoney(sb)}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input py-0.5 px-1 text-xs w-20"
                    value={sb || ''}
                    placeholder="0"
                    onChange={(e) =>
                      setBudget(
                        period.id,
                        c.id,
                        parseFloat(e.target.value) || 0,
                        s.id,
                      )
                    }
                  />
                  <div className="w-20 h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={clsx('h-full', sOver ? 'bg-overspend' : 'bg-accent')}
                      style={{
                        width: `${sOver ? 100 : sPct}%`,
                        backgroundColor: sOver ? undefined : s.color,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-5 py-4 bg-slate-50/30 border-t border-line">
      <div className="flex items-center justify-between mb-3 text-sm">
        <div className="flex gap-4">
          <span>
            <span className="label mr-1">Budgeted</span>
            <Money value={totals.totalBudget} className="font-semibold" />
          </span>
          <span>
            <span className="label mr-1">Spent</span>
            <Money value={totals.totalSpent} className="font-semibold" />
          </span>
          <span>
            <span className="label mr-1">Remaining</span>
            <Money
              value={totals.totalBudget - totals.totalSpent}
              tone={totals.totalBudget - totals.totalSpent < 0 ? 'overspend' : 'income'}
              className="font-semibold"
            />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {bills && renderCard(bills, { wide: true })}
        {otherCats.map((c) => renderCard(c))}
      </div>
    </div>
  )
}
