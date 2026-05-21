import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Modal } from './ui/Modal'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import type { SplitPart, Transaction } from '../types'
import { Money, formatMoney } from './ui/Money'
import clsx from 'clsx'

interface Props {
  tx: Transaction
  onClose: () => void
}

export function SplitModal({ tx, onClose }: Props) {
  const categories = useStore((s) => s.categories)
  const setSplits = useStore((s) => s.setSplits)
  const cats = sortedCategories(categories)

  const [parts, setParts] = useState<SplitPart[]>(
    tx.splits && tx.splits.length > 0
      ? tx.splits.map((s) => ({ ...s }))
      : [{ id: uuid(), catId: tx.catId, amount: tx.amount, note: '' }],
  )

  const total = parts.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0)
  const remaining = tx.amount - total
  const balanced = Math.abs(remaining) < 0.005

  const addPart = () => {
    const fallback =
      cats.find((c) => c.id !== tx.catId && !c.isIncome && !c.isTransfer)?.id ??
      cats[0]?.id ??
      ''
    setParts((cur) => [
      ...cur,
      {
        id: uuid(),
        catId: fallback,
        amount: Math.max(0, +remaining.toFixed(2)),
        note: '',
      },
    ])
  }

  const updatePart = (id: string, patch: Partial<SplitPart>) => {
    setParts((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const removePart = (id: string) => {
    setParts((cur) => cur.filter((p) => p.id !== id))
  }

  const save = () => {
    if (!balanced) return
    setSplits(tx.id, parts)
    onClose()
  }

  const clearSplits = () => {
    setSplits(tx.id, undefined)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Split transaction"
      size="lg"
      footer={
        <>
          {tx.splits && tx.splits.length > 0 && (
            <button className="btn btn-danger mr-auto" onClick={clearSplits}>
              Clear splits
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!balanced} onClick={save}>
            Save split
          </button>
        </>
      }
    >
      <div className="rounded-md bg-slate-50 px-3 py-2 mb-3 flex items-center justify-between">
        <div>
          <p className="label">Transaction</p>
          <p className="font-medium">{tx.title}</p>
        </div>
        <div className="text-right">
          <p className="label">Total</p>
          <Money value={tx.amount} className="font-semibold text-base" />
        </div>
      </div>

      <ul className="space-y-2 mb-3">
        {parts.map((p) => {
          const cat = cats.find((c) => c.id === p.catId)
          const subs = [...(cat?.subs ?? [])].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          return (
            <li key={p.id} className="grid grid-cols-12 gap-2 items-center">
              <select
                className="input col-span-4"
                value={p.catId}
                onChange={(e) =>
                  updatePart(p.id, { catId: e.target.value, subId: undefined })
                }
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
              <select
                className="input col-span-3"
                value={p.subId ?? ''}
                disabled={subs.length === 0}
                onChange={(e) =>
                  updatePart(p.id, { subId: e.target.value || undefined })
                }
              >
                <option value="">{subs.length === 0 ? '—' : 'None'}</option>
                {subs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input col-span-2 text-right"
                value={p.amount}
                onChange={(e) =>
                  updatePart(p.id, { amount: parseFloat(e.target.value) || 0 })
                }
              />
              <input
                className="input col-span-2"
                placeholder="Note"
                value={p.note ?? ''}
                onChange={(e) => updatePart(p.id, { note: e.target.value })}
              />
              <button
                className="btn btn-danger col-span-1 justify-center"
                disabled={parts.length <= 1}
                onClick={() => removePart(p.id)}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between">
        <button className="btn" onClick={addPart}>
          + Add split
        </button>
        <div
          className={clsx(
            'text-sm rounded-md px-3 py-1.5',
            balanced ? 'bg-green-50 text-income' : 'bg-amber-50 text-amber-700',
          )}
        >
          {balanced ? '✓ Balanced' : `Remaining: ${formatMoney(remaining)}`}
        </div>
      </div>
    </Modal>
  )
}
