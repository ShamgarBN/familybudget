import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { Category, PayPeriod, Transaction } from '../types'
import { useStore } from '../store/store'
import { withinPeriod } from '../lib/payPeriods'
import { EPS, getCategorySpent, getEffectiveB } from '../lib/budget'
import { Money } from './ui/Money'
import { TransactionRow } from './TransactionRow'
import { BudgetBreakdown } from './BudgetBreakdown'
import { periodLabel, fmtMid } from '../lib/dates'
import { Modal } from './ui/Modal'
import { DatePicker } from './ui/DatePicker'

interface Props {
  period: PayPeriod
  filteredTx: Transaction[]
  selectedSet: Set<string>
  onToggleSelect: (id: string) => void
  onToggleMany: (ids: string[], desired: boolean) => void
  /** Pre-sorted categories from the ledger so each row doesn't re-sort. */
  cats: Category[]
  /** Map of tx.id → running balance (filter-aware). Computed once per Ledger render. */
  runningBalances: Map<string, number>
  /** Real (non-projected) end balance through this period's end date. */
  endBalance: number
  /** Rolling projected balance through the end of this period. */
  rollingProjection: number
}

interface SelectAllProps {
  ids: string[]
  selectedSet: Set<string>
  onToggleMany: (ids: string[], desired: boolean) => void
}

function SelectAllCheckbox({ ids, selectedSet, onToggleMany }: SelectAllProps) {
  const ref = useRef<HTMLInputElement>(null)
  const total = ids.length
  let checkedCount = 0
  for (const id of ids) if (selectedSet.has(id)) checkedCount++
  const allChecked = total > 0 && checkedCount === total
  const someChecked = checkedCount > 0 && checkedCount < total

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someChecked
  }, [someChecked])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allChecked}
      disabled={total === 0}
      onChange={() => onToggleMany(ids, !allChecked)}
      aria-label={allChecked ? 'Deselect all in period' : 'Select all in period'}
      title={allChecked ? 'Deselect all in this period' : 'Select all in this period'}
    />
  )
}

export function PayPeriodSection({
  period,
  filteredTx,
  selectedSet,
  onToggleSelect,
  onToggleMany,
  cats,
  runningBalances,
  endBalance,
  rollingProjection,
}: Props) {
  const allTransactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const budgets = useStore((s) => s.budgets)
  const ui = useStore((s) => s.ui)
  const togglePeriodCollapsed = useStore((s) => s.togglePeriodCollapsed)
  const toggleBudgetOpen = useStore((s) => s.toggleBudgetOpen)
  const updatePayPeriod = useStore((s) => s.updatePayPeriod)
  const deletePayPeriod = useStore((s) => s.deletePayPeriod)

  const [editOpen, setEditOpen] = useState(false)
  const [editLabel, setEditLabel] = useState(period.label ?? '')
  const [editStart, setEditStart] = useState(period.start)
  const [editEnd, setEditEnd] = useState(period.end)

  const collapsed = ui.collapsedPeriods.includes(period.id)
  const budgetOpen = ui.openBudgets.includes(period.id)

  const periodTx = useMemo(
    () =>
      filteredTx
        .filter((t) => withinPeriod(t.date, period))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [filteredTx, period],
  )

  const stats = useMemo(() => {
    let income = 0
    let expense = 0
    const transferIds = new Set(categories.filter((c) => c.isTransfer).map((c) => c.id))
    for (const t of allTransactions) {
      if (t.skipped) continue
      if (!withinPeriod(t.date, period)) continue
      if (ui.accountFilter.length && !ui.accountFilter.includes(t.account)) continue
      if (transferIds.has(t.catId)) continue
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }
    return { income, expense, net: income - expense }
  }, [allTransactions, categories, period, ui.accountFilter])

  /** Remaining budget within this period only (used for the dashed footer row). */
  const projectedRemaining = useMemo(() => {
    let remaining = 0
    for (const category of categories) {
      if (category.isIncome) continue
      const budget = getEffectiveB(budgets, category, period.id).effective
      if (budget <= EPS) continue
      const spent = getCategorySpent(allTransactions, period, category)
      remaining += Math.max(0, budget - spent)
    }
    return remaining
  }, [allTransactions, budgets, categories, period])

  const saveEdit = () => {
    if (editEnd < editStart) {
      alert('End date must be on or after start date.')
      return
    }
    updatePayPeriod(period.id, {
      label: editLabel.trim() || undefined,
      start: editStart,
      end: editEnd,
    })
    setEditOpen(false)
  }

  const removePeriod = () => {
    if (
      confirm(
        'Delete this pay period? Transactions inside it will remain in the ledger.',
      )
    ) {
      deletePayPeriod(period.id)
    }
  }

  return (
    <div className="bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          className="text-muted hover:text-ink w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100"
          onClick={() => togglePeriodCollapsed(period.id)}
          aria-label={collapsed ? 'Expand period' : 'Collapse period'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h3 className="font-semibold truncate">
            {period.label || periodLabel(period.start, period.end)}
          </h3>
          <button
            className="text-muted hover:text-ink text-sm"
            onClick={() => {
              setEditLabel(period.label ?? '')
              setEditStart(period.start)
              setEditEnd(period.end)
              setEditOpen(true)
            }}
            title="Edit dates / label"
          >
            📅
          </button>
          <button
            className="text-muted hover:text-overspend text-sm"
            onClick={removePeriod}
            title="Delete this pay period"
          >
            ✕
          </button>
        </div>

        <div className="hidden md:flex items-center gap-4 text-sm">
          <span>
            <span className="label mr-1">In</span>
            <Money value={stats.income} tone="income" />
          </span>
          <span>
            <span className="label mr-1">Out</span>
            <Money value={stats.expense} />
          </span>
          <span>
            <span className="label mr-1">Net</span>
            <Money value={stats.net} tone={stats.net >= 0 ? 'income' : 'overspend'} />
          </span>
          <span>
            <span className="label mr-1">End</span>
            <Money value={endBalance} className="text-accent font-semibold" />
          </span>
          <span title="Rolling projection — real balance minus all unspent budget through this period.">
            <span className="label mr-1">Projected</span>
            <Money
              value={rollingProjection}
              className="font-semibold"
              tone="projected"
            />
          </span>
        </div>
      </div>

      {/* Mobile-only condensed stats row. Tap-friendly width and wraps cleanly. */}
      {!collapsed && (
        <div className="md:hidden grid grid-cols-2 gap-2 px-5 pb-3 text-xs">
          <span className="flex justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="label">In</span>
            <Money value={stats.income} tone="income" />
          </span>
          <span className="flex justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="label">Out</span>
            <Money value={stats.expense} />
          </span>
          <span className="flex justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="label">End</span>
            <Money value={endBalance} className="text-accent font-semibold" />
          </span>
          <span className="flex justify-between rounded-md bg-slate-50 px-2 py-1">
            <span className="label">Projected</span>
            <Money value={rollingProjection} tone="projected" className="font-semibold" />
          </span>
        </div>
      )}

      {!collapsed && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-muted">
                <tr>
                  <th className="px-3 py-2 w-8 align-middle text-center">
                    <SelectAllCheckbox
                      ids={periodTx.map((t) => t.id)}
                      selectedSet={selectedSet}
                      onToggleMany={onToggleMany}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium w-28">Date</th>
                  <th className="px-3 py-2 text-left font-medium w-28">Account</th>
                  <th className="px-3 py-2 text-left font-medium">Title</th>
                  <th className="px-3 py-2 text-left font-medium w-44">Category</th>
                  <th className="px-3 py-2 text-left font-medium">Memo</th>
                  <th className="px-3 py-2 text-right font-medium w-32">Amount</th>
                  <th className="px-3 py-2 text-right font-medium w-28">Balance</th>
                  <th className="px-3 py-2 text-center font-medium w-12">✓</th>
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {periodTx.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-muted text-sm"
                    >
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  periodTx.map((t) => (
                    <TransactionRow
                      key={t.id}
                      tx={t}
                      runningBalance={runningBalances.get(t.id) ?? 0}
                      selected={selectedSet.has(t.id)}
                      onToggleSelect={onToggleSelect}
                      cats={cats}
                    />
                  ))
                )}

                <tr className="border-t-2 border-dashed border-line italic text-projected">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-sm">{period.end}</td>
                  <td className="px-3 py-2 text-sm">Projection</td>
                  <td className="px-3 py-2 text-sm">
                    📊 Projected ending balance
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {projectedRemaining > 0 ? 'Remaining budget' : 'No remaining budget'}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    Rolling — includes prior periods' unspent budget
                  </td>
                  <td className="px-3 py-2 text-right">
                    {projectedRemaining > 0 ? (
                      <Money value={projectedRemaining} signed tone="overspend" />
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    <Money value={rollingProjection} tone="projected" />
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Budget breakdown toggle */}
          <button
            className={clsx(
              'w-full text-left px-5 py-2.5 text-sm font-medium border-t border-line bg-slate-50/30 hover:bg-slate-50 flex items-center gap-2',
              budgetOpen && 'bg-slate-50',
            )}
            onClick={() => toggleBudgetOpen(period.id)}
          >
            <span className="text-muted">{budgetOpen ? '▾' : '▸'}</span>
            <span>💰 Budget Breakdown</span>
          </button>
          {budgetOpen && <BudgetBreakdown period={period} />}
        </>
      )}

      {editOpen && (
        <Modal
          open
          onClose={() => setEditOpen(false)}
          title="Edit pay period"
          footer={
            <>
              <button className="btn" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveEdit}>
                Save
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="label">Custom label</label>
              <input
                className="input mt-1"
                value={editLabel}
                placeholder={periodLabel(period.start, period.end)}
                onChange={(e) => setEditLabel(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start</label>
                <DatePicker
                  className="mt-1"
                  value={editStart}
                  onChange={setEditStart}
                  ariaLabel="Pay period start"
                />
              </div>
              <div>
                <label className="label">End</label>
                <DatePicker
                  className="mt-1"
                  value={editEnd}
                  onChange={setEditEnd}
                  ariaLabel="Pay period end"
                />
              </div>
            </div>
            <p className="text-xs text-muted">
              Currently: {fmtMid(period.start)} – {fmtMid(period.end)}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
