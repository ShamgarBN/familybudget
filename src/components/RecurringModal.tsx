import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Modal } from './ui/Modal'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import type { RecurringFrequency, RecurringRule, TxType } from '../types'
import { todayISO } from '../lib/dates'
import { DatePicker } from './ui/DatePicker'

interface Props {
  rule: RecurringRule | null
  onClose: () => void
}

export function RecurringModal({ rule, onClose }: Props) {
  const accounts = useStore((s) => s.accounts)
  const categories = useStore((s) => s.categories)
  const upsertRecurring = useStore((s) => s.upsertRecurring)
  const deleteRecurring = useStore((s) => s.deleteRecurring)

  const sortedCats = sortedCategories(categories)

  const [form, setForm] = useState<RecurringRule>(
    rule ?? {
      id: uuid(),
      title: '',
      amount: 0,
      type: 'expense',
      catId:
        sortedCats.find((c) => !c.isIncome && !c.isTransfer)?.id ?? sortedCats[0]?.id ?? '',
      account: 'bank',
      frequency: 'monthly',
      startDate: todayISO(),
      memo: '',
    },
  )
  const [amountText, setAmountText] = useState(rule ? String(rule.amount) : '')

  const cat = sortedCats.find((c) => c.id === form.catId)
  const subs = cat?.subs ?? []
  const sortedSubs = [...subs].sort((a, b) => a.name.localeCompare(b.name))

  const valid = form.title.trim() && form.amount > 0 && form.catId && form.startDate

  const save = () => {
    if (!valid) return
    upsertRecurring(form)
    onClose()
  }

  const remove = () => {
    if (!rule) return
    if (confirm(`Delete "${rule.title}" and all its future instances?`)) {
      deleteRecurring(rule.id)
      onClose()
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? 'Edit recurring' : 'New recurring'}
      size="lg"
      footer={
        <>
          {rule && (
            <button className="btn btn-danger mr-auto" onClick={remove}>
              Delete
            </button>
          )}
          {rule && (
            <button
              className="btn"
              title={
                form.paused
                  ? 'Resume — future instances will be regenerated'
                  : 'Pause — stop creating new instances; existing past instances stay'
              }
              onClick={() => setForm({ ...form, paused: !form.paused })}
            >
              {form.paused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={save}
          >
            {rule ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {form.paused && (
          <div className="col-span-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 flex items-center gap-2">
            <span>⏸</span>
            <span>
              Paused — no new instances are being generated. Past instances are
              still in the ledger. Click <strong>Resume</strong> below to start regenerating.
            </span>
          </div>
        )}
        <div className="col-span-2">
          <label className="label">Title</label>
          <input
            className="input mt-1"
            autoFocus
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            className="input mt-1"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TxType })}
          >
            <option value="expense">− Out</option>
            <option value="income">+ In</option>
            <option value="neutral">~ No balance impact</option>
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="input mt-1"
            value={amountText}
            placeholder="0.00"
            onChange={(e) => {
              setAmountText(e.target.value)
              setForm({ ...form, amount: Math.abs(parseFloat(e.target.value) || 0) })
            }}
          />
        </div>

        <div>
          <label className="label">Category</label>
          <select
            className="input mt-1"
            value={form.catId}
            onChange={(e) =>
              setForm({ ...form, catId: e.target.value, subId: undefined })
            }
          >
            {sortedCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Subcategory</label>
          <select
            className="input mt-1"
            value={form.subId ?? ''}
            disabled={sortedSubs.length === 0}
            onChange={(e) =>
              setForm({ ...form, subId: e.target.value || undefined })
            }
          >
            <option value="">{sortedSubs.length === 0 ? '—' : 'None'}</option>
            {sortedSubs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Account</label>
          <select
            className="input mt-1"
            value={form.account}
            onChange={(e) =>
              setForm({ ...form, account: e.target.value as RecurringRule['account'] })
            }
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Frequency</label>
          <select
            className="input mt-1"
            value={form.frequency}
            onChange={(e) =>
              setForm({
                ...form,
                frequency: e.target.value as RecurringFrequency,
              })
            }
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="biannually">Bi-annually</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom (N days)</option>
          </select>
        </div>

        {form.frequency === 'custom' && (
          <div className="col-span-2">
            <label className="label">Days between</label>
            <input
              type="number"
              min="1"
              className="input mt-1"
              value={form.customDays ?? 30}
              onChange={(e) =>
                setForm({ ...form, customDays: parseInt(e.target.value) || 1 })
              }
            />
          </div>
        )}

        <div>
          <label className="label">Start date</label>
          <DatePicker
            className="mt-1"
            value={form.startDate}
            onChange={(startDate) => setForm({ ...form, startDate })}
            ariaLabel="Choose recurring start date"
          />
        </div>
        <div>
          <label className="label">End date (optional)</label>
          <div className="flex gap-1 mt-1">
            <DatePicker
              className="flex-1"
              value={form.endDate ?? ''}
              onChange={(endDate) => setForm({ ...form, endDate })}
              placeholder="No end date"
              ariaLabel="Choose recurring end date"
            />
            {form.endDate && (
              <button
                className="btn"
                title="Clear end date"
                onClick={() => setForm({ ...form, endDate: undefined })}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="col-span-2">
          <label className="label">Memo</label>
          <input
            className="input mt-1"
            value={form.memo ?? ''}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
        </div>
      </div>
    </Modal>
  )
}
