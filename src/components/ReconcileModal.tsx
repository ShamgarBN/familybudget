import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Modal } from './ui/Modal'
import { DatePicker } from './ui/DatePicker'
import { useStore } from '../store/store'
import { Money, formatMoney } from './ui/Money'
import type { AccountKind, Transaction } from '../types'

interface Props {
  onClose: () => void
}

/**
 * Statement reconciliation: compare what the bank says vs. what the ledger
 * thinks. The flow is intentionally simple — pick an account, enter an "as-of"
 * date and the bank's stated balance, then mark the matching transactions as
 * cleared in one button.
 *
 * The match is opportunistic — the user does the verification, the app just
 * surfaces uncleared rows up to the as-of date and the gap between the
 * ledger's running total and the statement.
 */
export function ReconcileModal({ onClose }: Props) {
  const accounts = useStore((s) => s.accounts)
  const transactions = useStore((s) => s.transactions)
  const bulkUpdate = useStore((s) => s.bulkUpdateTransactions)

  const [accountId, setAccountId] = useState<AccountKind>(accounts[0]?.id ?? 'bank')
  const [asOf, setAsOf] = useState<string>(new Date().toISOString().slice(0, 10))
  const [targetText, setTargetText] = useState<string>('')

  const acct = accounts.find((a) => a.id === accountId)

  const { ledgerThroughAsOf, candidates, clearedSum } = useMemo(() => {
    const start = acct?.startingBalance ?? 0
    let ledger = start
    let cleared = start
    const cands: Transaction[] = []
    for (const t of transactions) {
      if (t.skipped) continue
      if (t.account !== accountId) continue
      if (t.date > asOf) continue
      const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0
      ledger += sign * t.amount
      if (t.cleared) cleared += sign * t.amount
      else cands.push(t)
    }
    cands.sort((a, b) => a.date.localeCompare(b.date))
    return { ledgerThroughAsOf: ledger, candidates: cands, clearedSum: cleared }
  }, [transactions, accountId, asOf, acct])

  const target = parseFloat(targetText)
  const hasTarget = Number.isFinite(target)
  const diff = hasTarget ? target - ledgerThroughAsOf : 0
  const clearedDiff = hasTarget ? target - clearedSum : 0

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const togglePick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const pickedSum = useMemo(() => {
    let total = 0
    for (const t of candidates) {
      if (!picked.has(t.id)) continue
      const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0
      total += sign * t.amount
    }
    return total
  }, [candidates, picked])

  const remainingAfterPicked = hasTarget ? target - (clearedSum + pickedSum) : 0

  const onMarkCleared = () => {
    if (picked.size === 0) return
    bulkUpdate(
      Array.from(picked).map((id) => ({ id, patch: { cleared: true } })),
    )
    setPicked(new Set())
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Reconcile account"
      size="lg"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Done
          </button>
          <button
            className="btn btn-primary"
            disabled={picked.size === 0}
            onClick={onMarkCleared}
          >
            Mark {picked.size} cleared
          </button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Account</label>
          <select
            className="input mt-1"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value as AccountKind)
              setPicked(new Set())
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Statement date</label>
          <DatePicker
            className="mt-1"
            value={asOf}
            onChange={setAsOf}
            ariaLabel="Statement as-of date"
          />
        </div>
        <div>
          <label className="label">Statement balance</label>
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            className="input mt-1"
            value={targetText}
            placeholder="0.00"
            onChange={(e) => setTargetText(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-md border border-line p-3 bg-slate-50/40">
          <p className="label">Ledger total (incl. uncleared)</p>
          <Money value={ledgerThroughAsOf} className="text-base font-semibold" />
        </div>
        <div className="rounded-md border border-line p-3 bg-slate-50/40">
          <p className="label">Cleared only</p>
          <Money value={clearedSum} className="text-base font-semibold" />
        </div>
        <div
          className={clsx(
            'rounded-md border p-3',
            hasTarget && Math.abs(remainingAfterPicked) < 0.01
              ? 'bg-green-50 border-green-200'
              : hasTarget
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50/40 border-line',
          )}
        >
          <p className="label">
            {hasTarget ? 'Remaining gap' : 'Enter statement balance'}
          </p>
          {hasTarget ? (
            <Money
              value={remainingAfterPicked}
              className="text-base font-semibold"
              tone={
                Math.abs(remainingAfterPicked) < 0.01 ? 'income' : 'overspend'
              }
            />
          ) : (
            <span className="text-muted text-xs">
              Bank says: ${targetText || '—'}
            </span>
          )}
        </div>
      </div>

      {hasTarget && Math.abs(diff) >= 0.01 && (
        <p className="text-xs text-muted mt-3">
          Bank balance is {formatMoney(Math.abs(diff))}{' '}
          {diff > 0 ? 'higher' : 'lower'} than your ledger total. Tick uncleared
          rows below until the gap closes — typically transactions still in
          flight at statement time.
        </p>
      )}

      <div className="mt-4 max-h-72 overflow-y-auto border border-line rounded-md">
        {candidates.length === 0 ? (
          <p className="p-4 text-sm text-muted text-center">
            Everything in this account is already cleared through {asOf}.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-muted text-xs">
              <tr>
                <th className="px-2 py-1.5 w-8"></th>
                <th className="px-2 py-1.5 text-left">Date</th>
                <th className="px-2 py-1.5 text-left">Title</th>
                <th className="px-2 py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((t) => {
                const sign =
                  t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0
                return (
                  <tr
                    key={t.id}
                    className={clsx(
                      'border-t border-line cursor-pointer hover:bg-slate-50',
                      picked.has(t.id) && 'bg-accent/5',
                    )}
                    onClick={() => togglePick(t.id)}
                  >
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={picked.has(t.id)}
                        onChange={() => togglePick(t.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-2 py-1.5 num text-xs">{t.date}</td>
                    <td className="px-2 py-1.5 truncate max-w-[280px]">
                      {t.title}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Money
                        value={sign * t.amount}
                        signed
                        tone={sign > 0 ? 'income' : 'expense'}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
