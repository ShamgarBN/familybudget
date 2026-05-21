import { useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import type { AccountKind } from '../types'
import { exportLedgerCsv, parseFor, rowsToTransactions } from '../lib/csv'
import { useStore } from '../store/store'
import {
  CREDIT_CARD_CATEGORY_ID,
  INCOME_CATEGORY_ID,
  TRANSFER_CATEGORY_ID,
} from '../store/defaults'
import { buildLearned, categorize, recategorizeTx } from '../lib/categorize'

interface DropZoneProps {
  account: AccountKind
  label: string
  color: string
  onImport: (file: File) => void
}

function DropZone({ account, label, color, onImport }: DropZoneProps) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) onImport(file)
      }}
      className={clsx(
        'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-3 cursor-pointer transition text-center',
        over ? 'border-accent bg-accent/5' : 'border-line bg-slate-50/50 hover:border-accent/40',
      )}
    >
      <span
        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
      <span className="text-xs text-muted">Drop CSV or click</span>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onImport(f)
          if (inputRef.current) inputRef.current.value = ''
        }}
      />
    </label>
  )
}

export function ImportCard() {
  const accounts = useStore((s) => s.accounts)
  const transactions = useStore((s) => s.transactions)
  const categories = useStore((s) => s.categories)
  const learnedRules = useStore((s) => s.learnedRules)
  const addTransactionsBulk = useStore((s) => s.addTransactionsBulk)
  const bulkUpdate = useStore((s) => s.bulkUpdateTransactions)
  const [status, setStatus] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)
  const [pendingImportIds, setPendingImportIds] = useState<string[]>([])

  const otherCatId = useMemo(
    () =>
      categories.find((c) => c.name.toLowerCase() === 'other')?.id ??
      categories[0]?.id ??
      '',
    [categories],
  )

  const onFile = async (account: AccountKind, file: File) => {
    try {
      const text = await file.text()
      const rows = parseFor(account, text)
      if (rows.length === 0) {
        setStatus({ msg: `No rows detected in ${file.name}.`, tone: 'err' })
        return
      }
      const learned = buildLearned(transactions)
      let autoFromRules = 0
      let autoFromOther = 0
      const txs = rowsToTransactions(rows, account, (r) => {
        const guess = categorize(r.title, r.memo, categories, learned, learnedRules)
        if (
          guess?.catId === TRANSFER_CATEGORY_ID ||
          guess?.catId === CREDIT_CARD_CATEGORY_ID
        ) {
          autoFromOther += 1
          return { catId: guess.catId, subId: guess.subId }
        }
        if (r.type === 'income') return { catId: INCOME_CATEGORY_ID }
        if (r.type === 'neutral') return { catId: otherCatId }
        if (guess) {
          if (guess.source === 'manual-rule') autoFromRules += 1
          else if (guess.catId !== otherCatId) autoFromOther += 1
          return { catId: guess.catId, subId: guess.subId }
        }
        return { catId: otherCatId }
      })
      const importedIds = addTransactionsBulk(txs)
      setPendingImportIds((ids) => [...ids, ...importedIds])
      const total = autoFromRules + autoFromOther
      setStatus({
        msg: `Imported ${txs.length} from ${file.name}. Auto-categorized ${total}/${txs.length}${
          autoFromRules ? ` (${autoFromRules} from your trained rules)` : ''
        }. Auto-categorize will only touch this new upload batch.`,
        tone: 'ok',
      })
    } catch (e) {
      console.error(e)
      setStatus({ msg: `Failed to import ${file.name}.`, tone: 'err' })
    }
  }

  const onAutoCategorize = () => {
    const pending = new Set(pendingImportIds)
    if (pending.size === 0) {
      setStatus({
        msg: 'No new upload batch is waiting for auto-categorize. Older approved transactions were left alone.',
        tone: 'ok',
      })
      return
    }
    const learned = buildLearned(transactions)
    const updates: Array<{
      id: string
      patch: Parameters<typeof bulkUpdate>[0][number]['patch']
    }> = []
    let typeFlips = 0
    const targets = transactions.filter((t) => pending.has(t.id))
    for (const t of targets) {
      const patch = recategorizeTx(t, categories, learned, learnedRules)
      if (patch) {
        if (patch.type) typeFlips += 1
        updates.push({ id: t.id, patch })
      }
    }
    if (updates.length === 0) {
      setStatus({ msg: 'Nothing to update in the new upload batch.', tone: 'ok' })
      setPendingImportIds([])
      return
    }
    if (
      !confirm(
        `Update ${updates.length} transactions from the newest upload batch?` +
          `\n\nOlder approved transactions will not be changed.` +
          (typeFlips ? `\n\n${typeFlips} will also flip from expense → income.` : '') +
          '\n\n(One undo step will revert this.)',
      )
    ) {
      return
    }
    bulkUpdate(updates)
    setPendingImportIds([])
    setStatus({
      msg: `Auto-categorized ${updates.length} newly uploaded transactions${
        typeFlips ? ` (${typeFlips} type-corrected)` : ''
      }. Older transactions were not changed.`,
      tone: 'ok',
    })
  }

  const onExport = () => {
    const csv = exportLedgerCsv(transactions, categories, accounts)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `niemann-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold">Import / Export</h2>
          <p className="text-xs text-muted">
            CSV from your bank, card, or savings. Auto-categorized on import.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn"
            onClick={onAutoCategorize}
            title="Re-run categorization only on transactions imported since the last Auto-categorize"
          >
            🪄 Auto-categorize new uploads
          </button>
          <button className="btn" onClick={onExport}>
            ⬇ Export CSV
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {accounts.map((a) => (
          <DropZone
            key={a.id}
            account={a.id}
            label={a.label}
            color={a.color}
            onImport={(f) => onFile(a.id, f)}
          />
        ))}
      </div>
      {status && (
        <div
          className={clsx(
            'mt-3 text-xs rounded-md px-3 py-2',
            status.tone === 'ok' ? 'bg-green-50 text-income' : 'bg-red-50 text-overspend',
          )}
        >
          {status.msg}
        </div>
      )}
    </div>
  )
}
