import { memo, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { Category, Subcategory, Transaction, TxType } from '../types'
import { useStore } from '../store/store'
import { Money, formatMoney } from './ui/Money'
import { SplitModal } from './SplitModal'
import { DatePicker } from './ui/DatePicker'

interface Props {
  tx: Transaction
  runningBalance: number
  selected: boolean
  onToggleSelect: (id: string) => void
  /**
   * Pre-sorted categories from the parent. Passed in to avoid having every
   * row re-sort the full list on every keystroke / reflow.
   */
  cats: Category[]
}

/**
 * Single ledger row. The text cells (title, memo, amount) are real
 * <input> elements with their own local state so typing is decoupled from
 * the global store — the store only updates on blur. That keeps typing
 * snappy even with hundreds of rows visible.
 */
function TransactionRowImpl({
  tx,
  runningBalance,
  selected,
  onToggleSelect,
  cats,
}: Props) {
  const accounts = useStore((s) => s.accounts)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const deleteTransactions = useStore((s) => s.deleteTransactions)
  const revertOverrides = useStore((s) => s.revertOverrides)
  const setSkipped = useStore((s) => s.setSkipped)
  const toggleFlagged = useStore((s) => s.toggleFlagged)

  const [splitOpen, setSplitOpen] = useState(false)

  const cat = cats.find((c) => c.id === tx.catId)
  const subs: Subcategory[] = cat?.subs ?? []
  const sortedSubs = useMemo(
    () => [...subs].sort((a, b) => a.name.localeCompare(b.name)),
    [subs],
  )
  const acc = accounts.find((a) => a.id === tx.account)

  /* ----- Local input state — decoupled from the store. ----- */
  const [titleText, setTitleText] = useState(tx.title)
  const [memoText, setMemoText] = useState(tx.memo ?? '')
  const [amountText, setAmountText] = useState(() =>
    Number.isFinite(tx.amount) ? String(tx.amount) : '',
  )

  // Keep the local fields in sync if the underlying transaction changes
  // from outside (recurring sync, undo, import, etc).
  useEffect(() => {
    setTitleText(tx.title)
  }, [tx.id, tx.title])
  useEffect(() => {
    setMemoText(tx.memo ?? '')
  }, [tx.id, tx.memo])
  useEffect(() => {
    setAmountText(Number.isFinite(tx.amount) ? String(tx.amount) : '')
  }, [tx.id, tx.amount])

  const commitTitle = () => {
    const v = titleText.trim()
    if (v && v !== tx.title) updateTransaction(tx.id, { title: v })
    else if (!v) setTitleText(tx.title)
  }
  const commitMemo = () => {
    const v = memoText.trim()
    if (v !== (tx.memo ?? '')) updateTransaction(tx.id, { memo: v })
  }
  const commitAmount = () => {
    const parsed = Math.abs(parseFloat(amountText) || 0)
    if (parsed !== tx.amount) updateTransaction(tx.id, { amount: parsed })
    else setAmountText(String(parsed))
  }

  const amountTone =
    tx.type === 'income' ? 'income' : tx.type === 'neutral' ? 'neutral' : 'plain'
  const balanceTone = runningBalance < 0 ? 'overspend' : 'income'
  const hasSplits = !!tx.splits && tx.splits.length > 0
  const isOverridden = !!tx.overrides && tx.overrides.length > 0

  return (
    <>
      <tr
        className={clsx(
          'border-t border-line group hover:bg-slate-50/60 transition',
          tx.cleared && 'opacity-60',
        )}
        data-tx-row="1"
      >
        <td className="px-3 py-1.5 text-center align-middle">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(tx.id)}
            aria-label="Select"
          />
        </td>

        <td className="px-3 py-1.5 align-middle">
          <DatePicker
            className="w-28"
            value={tx.date}
            onChange={(date) => updateTransaction(tx.id, { date })}
            ariaLabel="Choose transaction date"
          />
        </td>

        <td className="px-3 py-1.5 align-middle">
          <select
            className="input py-1 px-1.5 text-xs"
            value={tx.account}
            onChange={(e) =>
              updateTransaction(tx.id, {
                account: e.target.value as Transaction['account'],
              })
            }
            title={acc?.label}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </td>

        <td className="px-3 py-1.5 align-middle min-w-[180px]">
          <div className="flex items-center gap-1.5">
            {tx.recurringId &&
              (isOverridden ? (
                <button
                  type="button"
                  title="Manually overridden — click to re-sync from the recurring rule"
                  className="text-xs shrink-0 text-accent hover:text-overspend"
                  onClick={() => {
                    if (
                      confirm(
                        'Reset this instance to match the recurring rule? Your manual edits will be discarded.',
                      )
                    ) {
                      revertOverrides(tx.id)
                    }
                  }}
                >
                  ✎
                </button>
              ) : (
                <span
                  title="Recurring instance"
                  className="text-xs shrink-0 text-muted"
                >
                  🔄
                </span>
              ))}
            <input
              className="input py-1 px-1.5 text-sm flex-1 min-w-0"
              value={titleText}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setTitleText(tx.title)
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </div>
        </td>

        <td className="px-3 py-1.5 align-middle">
          {hasSplits ? (
            <div className="flex flex-wrap gap-1">
              {tx.splits!.map((s) => {
                const c = cats.find((x) => x.id === s.catId)
                return (
                  <span
                    key={s.id}
                    className="text-xs px-1.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: c?.color ?? '#94a3b8' }}
                    title={`${c?.name ?? ''} ${formatMoney(s.amount)}`}
                  >
                    {c?.emoji} {s.amount.toFixed(0)}
                  </span>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <select
                className="input py-1 px-1.5 text-xs flex-1"
                value={tx.catId}
                onChange={(e) =>
                  updateTransaction(tx.id, {
                    catId: e.target.value,
                    subId: undefined,
                  })
                }
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
              {sortedSubs.length > 0 && (
                <select
                  className="input py-1 px-1.5 text-xs w-24"
                  value={tx.subId ?? ''}
                  onChange={(e) =>
                    updateTransaction(tx.id, { subId: e.target.value || undefined })
                  }
                >
                  <option value="">—</option>
                  {sortedSubs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emoji} {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </td>

        <td className="px-3 py-1.5 align-middle text-muted">
          <input
            className="input py-1 px-1.5 text-sm w-full"
            value={memoText}
            placeholder=""
            onChange={(e) => setMemoText(e.target.value)}
            onBlur={commitMemo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') {
                setMemoText(tx.memo ?? '')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </td>

        <td className="px-3 py-1.5 align-middle text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1">
            <select
              className="input py-1 px-1.5 text-xs w-12"
              value={tx.type}
              onChange={(e) =>
                updateTransaction(tx.id, { type: e.target.value as TxType })
              }
              title="Transaction type"
            >
              <option value="expense">−</option>
              <option value="income">+</option>
              <option value="neutral">~</option>
            </select>
            <input
              type="text"
              inputMode="decimal"
              className={clsx(
                'input py-1 px-1.5 text-sm text-right num w-24',
                amountTone === 'income' && 'text-income',
                amountTone === 'neutral' && 'text-muted italic',
              )}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={commitAmount}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setAmountText(String(tx.amount))
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </div>
        </td>

        <td className="px-3 py-1.5 align-middle text-right whitespace-nowrap">
          <Money
            value={runningBalance}
            tone={tx.type === 'neutral' ? 'neutral' : balanceTone}
          />
        </td>

        <td className="px-3 py-1.5 align-middle text-center">
          <input
            type="checkbox"
            checked={!!tx.cleared}
            onChange={(e) => updateTransaction(tx.id, { cleared: e.target.checked })}
            aria-label="Cleared"
          />
        </td>

        <td className="px-3 py-1.5 align-middle text-right whitespace-nowrap">
          {/* Always-visible flag for touch screens; other actions appear on hover. */}
          <div className="flex justify-end items-center gap-1">
            <button
              className={clsx(
                'w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100 transition',
                tx.flagged ? 'text-yellow-500' : 'text-muted opacity-0 group-hover:opacity-100',
              )}
              title={tx.flagged ? 'Unflag' : 'Flag for review'}
              onClick={() => toggleFlagged(tx.id)}
            >
              {tx.flagged ? '★' : '☆'}
            </button>
            <div className="opacity-0 group-hover:opacity-100 transition flex justify-end gap-1">
              <button
                className="text-muted hover:text-accent w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100"
                title="Split"
                onClick={() => setSplitOpen(true)}
              >
                ✂️
              </button>
              {tx.recurringId && (
                <button
                  className="text-muted hover:text-accent w-6 h-6 inline-flex items-center justify-center rounded hover:bg-slate-100"
                  title="Skip this instance (e.g. unpaid leave)"
                  onClick={() => {
                    if (
                      confirm(
                        'Skip this recurring instance? It will stay hidden and won\'t reappear after future regen.',
                      )
                    ) {
                      setSkipped(tx.id, true)
                    }
                  }}
                >
                  ⏭
                </button>
              )}
              <button
                className="text-muted hover:text-overspend w-6 h-6 inline-flex items-center justify-center rounded hover:bg-red-50"
                title="Delete"
                onClick={() => {
                  if (confirm('Delete this transaction?')) {
                    deleteTransactions([tx.id])
                  }
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </td>
      </tr>

      {splitOpen && (
        <SplitModal tx={tx} onClose={() => setSplitOpen(false)} />
      )}
    </>
  )
}

export const TransactionRow = memo(TransactionRowImpl)
