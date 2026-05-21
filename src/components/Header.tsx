import { useMemo } from 'react'
import clsx from 'clsx'
import { useStore } from '../store/store'
import { formatMoney } from './ui/Money'

interface Props {
  onOpenTransaction: () => void
  onOpenCategories: () => void
  onOpenSettings: () => void
}

export function Header({ onOpenTransaction, onOpenCategories, onOpenSettings }: Props) {
  const accounts = useStore((s) => s.accounts)
  const transactions = useStore((s) => s.transactions)
  const ui = useStore((s) => s.ui)
  const search = ui.search
  const accountFilter = ui.accountFilter
  const donutFilter = ui.donutFilter
  const setSearch = useStore((s) => s.setSearch)
  const toggleAccountFilter = useStore((s) => s.toggleAccountFilter)
  const clearAccountFilter = useStore((s) => s.clearAccountFilter)
  const setDonutFilter = useStore((s) => s.setDonutFilter)
  const undo = useStore((s) => s.undo)

  /**
   * Real running balance per account = startingBalance + Σ(income) − Σ(expense).
   * Skipped instances and neutral-type rows are excluded so the user sees the
   * exact same number their bank statement would show today.
   */
  const balancesByAccount = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of accounts) m.set(a.id, a.startingBalance ?? 0)
    for (const t of transactions) {
      if (t.skipped) continue
      const cur = m.get(t.account) ?? 0
      if (t.type === 'income') m.set(t.account, cur + t.amount)
      else if (t.type === 'expense') m.set(t.account, cur - t.amount)
    }
    return m
  }, [accounts, transactions])

  return (
    <header className="app-drag sticky top-0 z-40 bg-bg/85 backdrop-blur border-b border-line">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <span className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center text-lg shadow-sm">
            💰
          </span>
          <h1 className="text-lg font-semibold tracking-tight">
            Niemann Family Finances
          </h1>
        </div>

        <div className="app-no-drag flex items-center gap-1 flex-wrap">
          <button
            className={clsx('pill', accountFilter.length === 0 && 'active')}
            onClick={clearAccountFilter}
          >
            All
          </button>
          {accounts.map((a) => {
            const bal = balancesByAccount.get(a.id) ?? 0
            const negative = bal < 0
            return (
              <button
                key={a.id}
                className={clsx(
                  'pill',
                  accountFilter.includes(a.id) && 'active',
                )}
                onClick={() => toggleAccountFilter(a.id)}
                title={`${a.label} — current balance ${formatMoney(bal)}`}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: a.color }}
                />
                <span>{a.label}</span>
                <span
                  className={clsx(
                    'num text-xs',
                    accountFilter.includes(a.id)
                      ? 'text-white/90'
                      : negative
                        ? 'text-overspend'
                        : 'text-muted',
                  )}
                >
                  {formatMoney(bal)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="app-no-drag flex-1 min-w-[220px] flex items-center gap-2">
          <div className="relative w-full max-w-md">
            <input
              className="input pl-9"
              placeholder='Search… try amount:>50, category:Bills, cleared:no'
              title="Operators: amount:>50  category:Bills  account:credit  cleared:yes  flagged:yes  type:expense  before:2026-01-31  after:2025-12-01"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
              🔍
            </span>
            {search && (
              <button
                aria-label="Clear search"
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink w-6 h-6 inline-flex items-center justify-center rounded"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {donutFilter && (
          <button
            className="app-no-drag pill active"
            onClick={() => setDonutFilter(null)}
            title="Clear donut filter"
          >
            Filter on • clear ×
          </button>
        )}

        <div className="app-no-drag flex items-center gap-2">
          <button className="btn" onClick={undo} title="Undo (⌘Z)">
            ↶ Undo
          </button>
          <button className="btn btn-primary" onClick={onOpenTransaction}>
            + Transaction
          </button>
          <button className="btn" onClick={onOpenCategories}>
            ⚙ Categories
          </button>
          <button className="btn" onClick={onOpenSettings}>
            ⚙ Settings
          </button>
        </div>
      </div>
    </header>
  )
}
