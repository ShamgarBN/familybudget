import { useMemo, useRef, useState } from 'react'
import { Modal } from './ui/Modal'
import { ReconcileModal } from './ReconcileModal'
import { listBackups, readBackup, useStore } from '../store/store'
import { sortedPeriods } from '../lib/payPeriods'
import { downloadPeriodReport, downloadRangeReport } from '../lib/pdf'
import { sortedCategories } from '../store/selectors'
import type { PayPeriodFrequency } from '../types'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const exportState = useStore((s) => s.exportState)
  const importState = useStore((s) => s.importState)
  const reset = useStore((s) => s.reset)
  const periods = useStore((s) => s.payPeriods)
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const accounts = useStore((s) => s.accounts)
  const budgets = useStore((s) => s.budgets)
  const learnedRules = useStore((s) => s.learnedRules)
  const clearLearnedRule = useStore((s) => s.clearLearnedRule)
  const clearAllLearnedRules = useStore((s) => s.clearAllLearnedRules)
  const updateAccount = useStore((s) => s.updateAccount)
  const [reconcileOpen, setReconcileOpen] = useState(false)

  const sortedRules = useMemo(
    () =>
      Object.entries(learnedRules)
        .map(([sig, rule]) => ({ sig, ...rule }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [learnedRules],
  )
  const cats = sortedCategories(categories)

  const fileRef = useRef<HTMLInputElement>(null)
  const [pdfPeriodId, setPdfPeriodId] = useState<string>(
    sortedPeriods(periods)[0]?.id ?? '',
  )
  const [rangeStart, setRangeStart] = useState<string>('')
  const [rangeEnd, setRangeEnd] = useState<string>('')
  const [backupVersion, setBackupVersion] = useState(0)
  const backups = useMemo(() => listBackups(), [backupVersion])

  const onBackup = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `niemann-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onRestore = async (file: File) => {
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      if (
        confirm(
          'Restore from this file? This will replace your current data (one undo step is preserved).',
        )
      ) {
        importState(json)
        onClose()
      }
    } catch (e) {
      alert('Could not parse this file as JSON.')
    }
  }

  const onRestoreBackup = (key: string, date: string) => {
    const data = readBackup(key)
    if (!data) {
      alert('That backup could not be read.')
      return
    }
    if (
      confirm(
        `Restore the auto-backup from ${date}? Your current data will be replaced (one undo step is preserved).`,
      )
    ) {
      importState(data)
      onClose()
    }
  }

  const onPdf = () => {
    const period = periods.find((p) => p.id === pdfPeriodId)
    if (!period) return
    downloadPeriodReport({
      period,
      transactions,
      categories,
      accounts,
      budgets,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Settings"
      size="lg"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="font-semibold mb-2">Pay periods</h3>
          <label className="label">Frequency</label>
          <select
            className="input mt-1 max-w-xs"
            value={settings.payPeriodFrequency}
            onChange={(e) =>
              setSettings({ payPeriodFrequency: e.target.value as PayPeriodFrequency })
            }
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="semimonthly">Semi-monthly (1–15, 16–end)</option>
            <option value="monthly">Monthly</option>
          </select>
          <p className="text-xs text-muted mt-1">
            Used when auto-creating new pay periods. Existing periods aren’t changed.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="label">Anchor date</label>
              <input
                type="date"
                className="input mt-1"
                value={settings.payPeriodAnchor}
                onChange={(e) => setSettings({ payPeriodAnchor: e.target.value })}
              />
              <p className="text-xs text-muted mt-1">
                Seed for the first auto-generated period.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="font-semibold mb-2">Appearance</h3>
          <p className="text-xs text-muted mb-2">
            Dark mode is in beta — some color combinations may still need
            polish.
          </p>
          <select
            className="input max-w-[220px]"
            value={settings.theme ?? 'system'}
            onChange={(e) =>
              setSettings({ theme: e.target.value as 'light' | 'dark' | 'system' })
            }
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </section>

        <section>
          <h3 className="font-semibold mb-2">Reconcile against statement</h3>
          <p className="text-xs text-muted mb-2">
            Match your ledger to a bank statement, then mark cleared in one shot.
          </p>
          <button className="btn" onClick={() => setReconcileOpen(true)}>
            🧾 Open reconciliation
          </button>
        </section>

        <section>
          <h3 className="font-semibold mb-2">Starting balances</h3>
          <p className="text-xs text-muted mb-2">
            Anchor each account's running balance with the real balance the day
            before your earliest transaction. Defaults to $0.
          </p>
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-line bg-slate-50/40 px-3 py-2"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: a.color }}
                />
                <span className="text-sm font-medium flex-1">{a.label}</span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  className="input max-w-[140px] text-right num"
                  value={a.startingBalance ?? 0}
                  onChange={(e) =>
                    updateAccount(a.id, {
                      startingBalance: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="font-semibold mb-2">PDF report</h3>
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <div className="flex-1 min-w-[220px]">
              <label className="label">Pay period</label>
              <select
                className="input mt-1"
                value={pdfPeriodId}
                onChange={(e) => setPdfPeriodId(e.target.value)}
              >
                {sortedPeriods(periods).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || `${p.start} – ${p.end}`}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={onPdf} disabled={!pdfPeriodId}>
              Download single-period PDF
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">From</label>
              <input
                type="date"
                className="input mt-1"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date"
                className="input mt-1"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
            <button
              className="btn"
              disabled={!rangeStart || !rangeEnd || rangeEnd < rangeStart}
              onClick={() =>
                downloadRangeReport({
                  startISO: rangeStart,
                  endISO: rangeEnd,
                  transactions,
                  categories,
                  accounts,
                })
              }
            >
              Download date-range PDF
            </button>
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2 gap-2">
            <div>
              <h3 className="font-semibold">Learned merchant rules</h3>
              <p className="text-xs text-muted">
                Every time you change a transaction's category, the merchant fingerprint is
                remembered and applied to future imports + Auto-categorize runs.
              </p>
            </div>
            {sortedRules.length > 0 && (
              <button
                className="btn btn-danger"
                onClick={() => {
                  if (
                    confirm(
                      `Forget all ${sortedRules.length} learned rules? Built-in keyword rules and historical inference still apply.`,
                    )
                  ) {
                    clearAllLearnedRules()
                  }
                }}
              >
                Clear all
              </button>
            )}
          </div>
          {sortedRules.length === 0 ? (
            <p className="text-sm text-muted py-3 text-center bg-slate-50/60 rounded-md">
              No learned rules yet. Re-categorize a transaction in the ledger to teach one.
            </p>
          ) : (
            <ul className="border border-line rounded-md divide-y divide-line max-h-60 overflow-y-auto">
              {sortedRules.map((r) => {
                const cat = cats.find((c) => c.id === r.catId)
                const sub = cat?.subs.find((s) => s.id === r.subId)
                const when = new Date(r.updatedAt)
                return (
                  <li
                    key={r.sig}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <code className="num text-xs bg-slate-100 rounded px-1.5 py-0.5 text-ink/80 truncate max-w-[200px]">
                      {r.sig}
                    </code>
                    <span className="text-muted">→</span>
                    <span className="flex-1 truncate">
                      {cat ? `${cat.emoji} ${cat.name}` : '— deleted —'}
                      {sub && ` › ${sub.emoji} ${sub.name}`}
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {r.hits}× · {when.toLocaleDateString()}
                    </span>
                    <button
                      className="text-muted hover:text-overspend rounded w-6 h-6 inline-flex items-center justify-center hover:bg-red-50"
                      onClick={() => clearLearnedRule(r.sig)}
                      aria-label="Forget rule"
                      title="Forget this rule"
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-semibold mb-2">Backup &amp; restore</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={onBackup}>
              ⬇ Download JSON backup
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              ⬆ Restore from JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onRestore(f)
                if (fileRef.current) fileRef.current.value = ''
              }}
            />
          </div>
          <p className="text-xs text-muted mt-1">
            Includes accounts, categories, transactions, recurring rules, pay periods,
            budgets, and settings.
          </p>

          <div className="mt-3">
            <p className="label mb-1">Auto-backups (last {backups.length} day{backups.length === 1 ? '' : 's'})</p>
            {backups.length === 0 ? (
              <p className="text-xs text-muted">
                A snapshot is saved automatically each day you open the app.
              </p>
            ) : (
              <ul className="border border-line rounded-md divide-y divide-line max-h-40 overflow-y-auto">
                {backups.map((b) => (
                  <li
                    key={b.key}
                    className="flex items-center justify-between px-3 py-1.5 text-sm"
                  >
                    <span className="num">{b.date}</span>
                    <button
                      className="btn"
                      onClick={() => onRestoreBackup(b.key, b.date)}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              className="text-xs text-muted hover:text-ink mt-1"
              onClick={() => setBackupVersion((v) => v + 1)}
            >
              ⟳ Refresh list
            </button>
          </div>
        </section>

        <section>
          <h3 className="font-semibold mb-2 text-overspend">Danger zone</h3>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (
                confirm(
                  'Reset all data to defaults? This cannot be undone (a backup is recommended first).',
                )
              ) {
                reset()
                onClose()
              }
            }}
          >
            Reset all data
          </button>
        </section>
      </div>
      {reconcileOpen && (
        <ReconcileModal onClose={() => setReconcileOpen(false)} />
      )}
    </Modal>
  )
}
