import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Modal } from './ui/Modal'
import { useStore } from '../store/store'
import { DatePicker } from './ui/DatePicker'
import { todayISO } from '../lib/dates'
import type {
  AccountKind,
  RecurringFrequency,
  RecurringRule,
} from '../types'
import { TRANSFER_CATEGORY_ID } from '../store/defaults'

interface Props {
  onClose: () => void
}

/**
 * One-shot wizard that creates a *pair* of recurring rules to model a
 * transfer between two accounts. The source rule is a recurring expense; the
 * destination is a matching recurring income, both pinned to the Transfer
 * category so the totals stay neutral. Splitting them into two rules keeps
 * each account's running balance correct without further bookkeeping.
 */
export function TransferTemplateModal({ onClose }: Props) {
  const accounts = useStore((s) => s.accounts)
  const upsertRecurring = useStore((s) => s.upsertRecurring)

  const [title, setTitle] = useState('Bank → Savings')
  const [amountText, setAmountText] = useState('')
  const [from, setFrom] = useState<AccountKind>(accounts[0]?.id ?? 'bank')
  const [to, setTo] = useState<AccountKind>(
    accounts[1]?.id ?? accounts[0]?.id ?? 'savings',
  )
  const [frequency, setFrequency] = useState<RecurringFrequency>('biweekly')
  const [startDate, setStartDate] = useState(todayISO())

  const amount = Math.abs(parseFloat(amountText) || 0)
  const valid = title.trim() && amount > 0 && from !== to

  const save = () => {
    if (!valid) return
    const sharedId = uuid()
    const out: RecurringRule = {
      id: uuid(),
      title: `${title.trim()} (out)`,
      memo: `Linked transfer ${sharedId}`,
      catId: TRANSFER_CATEGORY_ID,
      amount,
      type: 'expense',
      account: from,
      frequency,
      startDate,
    }
    const inn: RecurringRule = {
      id: uuid(),
      title: `${title.trim()} (in)`,
      memo: `Linked transfer ${sharedId}`,
      catId: TRANSFER_CATEGORY_ID,
      amount,
      type: 'income',
      account: to,
      frequency,
      startDate,
    }
    upsertRecurring(out)
    upsertRecurring(inn)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Recurring transfer"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            Create pair
          </button>
        </>
      }
    >
      <p className="text-sm text-muted mb-3">
        Creates two linked recurring rules in the Transfer category — an
        outflow on the source account and an inflow on the destination — so the
        money movement is reflected in both balances without showing up as
        income or expense.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Title</label>
          <input
            autoFocus
            className="input mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="label">From account</label>
          <select
            className="input mt-1"
            value={from}
            onChange={(e) => setFrom(e.target.value as AccountKind)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">To account</label>
          <select
            className="input mt-1"
            value={to}
            onChange={(e) => setTo(e.target.value as AccountKind)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Amount</label>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="input mt-1"
            value={amountText}
            placeholder="0.00"
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Frequency</label>
          <select
            className="input mt-1"
            value={frequency}
            onChange={(e) =>
              setFrequency(e.target.value as RecurringFrequency)
            }
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="biannually">Bi-annually</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Start date</label>
          <DatePicker
            className="mt-1"
            value={startDate}
            onChange={setStartDate}
            ariaLabel="Recurring transfer start date"
          />
        </div>
      </div>
      {from === to && (
        <p className="mt-3 text-xs text-overspend">
          Source and destination accounts must be different.
        </p>
      )}
    </Modal>
  )
}
