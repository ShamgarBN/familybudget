import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import clsx from 'clsx'
import { Modal } from './ui/Modal'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import type { AccountKind, RecurringFrequency, RecurringRule, TxType } from '../types'
import { todayISO } from '../lib/dates'
import { DatePicker } from './ui/DatePicker'

interface Props {
  mode: 'create'
  onClose: () => void
}

export function TransactionModal({ onClose }: Props) {
  const accounts = useStore((s) => s.accounts)
  const categories = useStore((s) => s.categories)
  const addTransaction = useStore((s) => s.addTransaction)
  const upsertRecurring = useStore((s) => s.upsertRecurring)

  const cats = sortedCategories(categories)
  const [entryKind, setEntryKind] = useState<'one-time' | 'recurring'>('one-time')
  const [date, setDate] = useState(todayISO())
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [account, setAccount] = useState<AccountKind>('bank')
  const [title, setTitle] = useState('')
  const [catId, setCatId] = useState(
    cats.find((c) => !c.isIncome && !c.isTransfer)?.id ?? cats[0]?.id ?? '',
  )
  const [subId, setSubId] = useState<string | undefined>(undefined)
  const [type, setType] = useState<TxType>('expense')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [customDays, setCustomDays] = useState(30)
  const [amountText, setAmountText] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    setSubId(undefined)
  }, [catId])

  const cat = cats.find((c) => c.id === catId)
  const subs = cat?.subs ?? []
  const sortedSubs = [...subs].sort((a, b) => a.name.localeCompare(b.name))
  const amount = Math.abs(parseFloat(amountText) || 0)
  const valid =
    title.trim() &&
    amount > 0 &&
    (entryKind === 'one-time' || !endDate || endDate >= date)

  const save = () => {
    if (!valid) return
    if (entryKind === 'recurring') {
      const rule: RecurringRule = {
        id: uuid(),
        title: title.trim(),
        memo: memo.trim() || undefined,
        catId,
        subId,
        amount,
        type,
        account,
        frequency,
        customDays: frequency === 'custom' ? customDays : undefined,
        startDate: date,
        endDate,
      }
      upsertRecurring(rule)
      onClose()
      return
    }
    addTransaction({
      date,
      account,
      title: title.trim(),
      memo: memo.trim() || undefined,
      catId,
      subId,
      amount,
      type,
      cleared: false,
    })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New transaction"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!valid}>
            {entryKind === 'recurring' ? 'Create recurring' : 'Add transaction'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex rounded-lg border border-line bg-slate-50 p-1">
          <button
            className={clsx(
              'btn flex-1 justify-center',
              entryKind === 'one-time' && 'btn-primary',
            )}
            onClick={() => setEntryKind('one-time')}
          >
            One-time
          </button>
          <button
            className={clsx(
              'btn flex-1 justify-center',
              entryKind === 'recurring' && 'btn-primary',
            )}
            onClick={() => setEntryKind('recurring')}
          >
            Recurring
          </button>
        </div>
        <div>
          <label className="label">{entryKind === 'recurring' ? 'Start date' : 'Date'}</label>
          <DatePicker
            className="mt-1"
            value={date}
            onChange={setDate}
            ariaLabel="Choose transaction date"
          />
        </div>
        {entryKind === 'recurring' && (
          <>
            <div>
              <label className="label">Frequency</label>
              <select
                className="input mt-1"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="biannually">Bi-annually</option>
                <option value="yearly">Yearly</option>
                <option value="custom">Custom (N days)</option>
              </select>
            </div>
            <div>
              <label className="label">End date (optional)</label>
              <div className="flex gap-1 mt-1">
                <DatePicker
                  className="flex-1"
                  value={endDate ?? ''}
                  onChange={setEndDate}
                  placeholder="No end date"
                  ariaLabel="Choose recurring end date"
                />
                {endDate && (
                  <button className="btn" onClick={() => setEndDate(undefined)}>
                    ×
                  </button>
                )}
              </div>
            </div>
            {frequency === 'custom' && (
              <div className="col-span-2">
                <label className="label">Days between</label>
                <input
                  type="number"
                  min="1"
                  className="input mt-1"
                  value={customDays}
                  onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
                />
              </div>
            )}
          </>
        )}
        <div>
          <label className="label">Account</label>
          <select
            className="input mt-1"
            value={account}
            onChange={(e) => setAccount(e.target.value as AccountKind)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Title</label>
          <input
            autoFocus
            className="input mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) save()
            }}
          />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input mt-1"
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
          >
            {cats.map((c) => (
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
            value={subId ?? ''}
            disabled={sortedSubs.length === 0}
            onChange={(e) => setSubId(e.target.value || undefined)}
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
          <label className="label">Type</label>
          <select
            className="input mt-1"
            value={type}
            onChange={(e) => setType(e.target.value as TxType)}
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
            step="0.01"
            min="0"
            inputMode="decimal"
            className="input mt-1"
            value={amountText}
            placeholder="0.00"
            onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="label">Memo</label>
          <input
            className="input mt-1"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
