import { useState } from 'react'
import { useStore } from '../store/store'
import { findCategory } from '../store/selectors'
import { Money } from './ui/Money'
import { RecurringModal } from './RecurringModal'
import { TransferTemplateModal } from './TransferTemplateModal'
import type { RecurringRule } from '../types'

const FREQ_LABEL: Record<RecurringRule['frequency'], string> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  biannually: 'Bi-annually',
  yearly: 'Yearly',
  custom: 'Custom',
}

export function RecurringCard() {
  const recurring = useStore((s) => s.recurring)
  const categories = useStore((s) => s.categories)
  const accounts = useStore((s) => s.accounts)
  const [open, setOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringRule | null>(null)

  const sorted = [...recurring].sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold">Recurring</h2>
          <p className="text-xs text-muted">
            Auto-generates transactions up to 2 years out.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn"
            onClick={() => setTransferOpen(true)}
            title="Recurring transfer between two accounts"
          >
            ↔ Transfer
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted py-3 text-center">
          No recurring transactions yet.
        </p>
      ) : (
        <ul className="divide-y divide-line max-h-60 overflow-y-auto -mx-1">
          {sorted.map((r) => {
            const cat = findCategory(categories, r.catId)
            const acc = accounts.find((a) => a.id === r.account)
            const sign = r.type === 'income' ? '+' : r.type === 'expense' ? '−' : '~'
            return (
              <li key={r.id}>
                <button
                  className="w-full text-left px-1 py-2 hover:bg-slate-50 rounded flex items-center gap-2 group"
                  onClick={() => {
                    setEditing(r)
                    setOpen(true)
                  }}
                >
                  <span className="text-lg">{cat?.emoji ?? '📌'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-1.5">
                      {r.paused && (
                        <span
                          className="text-[10px] uppercase tracking-wide px-1 py-0.5 rounded bg-amber-100 text-amber-700"
                          title="Paused"
                        >
                          ⏸ Paused
                        </span>
                      )}
                      <span className="truncate">{r.title}</span>
                    </div>
                    <div className="text-xs text-muted truncate">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                        style={{ backgroundColor: acc?.color ?? '#cbd5e1' }}
                      />
                      {acc?.label ?? r.account} · {FREQ_LABEL[r.frequency]}
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted mr-1">{sign}</span>
                    <Money
                      value={r.amount}
                      tone={
                        r.type === 'income'
                          ? 'income'
                          : r.type === 'neutral'
                            ? 'neutral'
                            : 'plain'
                      }
                    />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && (
        <RecurringModal
          rule={editing}
          onClose={() => setOpen(false)}
        />
      )}
      {transferOpen && (
        <TransferTemplateModal onClose={() => setTransferOpen(false)} />
      )}
    </div>
  )
}
