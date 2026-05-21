import { useState } from 'react'
import { useStore } from '../store/store'
import { sortedCategories } from '../store/selectors'
import type { AccountKind, Transaction } from '../types'
import { DatePicker } from './ui/DatePicker'
import { Modal } from './ui/Modal'

interface Props {
  selectedIds: string[]
  onClearSelection: () => void
  onDelete: () => void
}

/**
 * Floating action bar shown above the ledger when one or more transactions
 * are selected. Lets the user re-categorize, mark cleared, change account,
 * or shift dates in one shot. Each action goes through a single bulkUpdate
 * call so it's a single undo step.
 */
export function BulkActionsBar({ selectedIds, onClearSelection, onDelete }: Props) {
  const accounts = useStore((s) => s.accounts)
  const categories = useStore((s) => s.categories)
  const bulkUpdate = useStore((s) => s.bulkUpdateTransactions)

  const [openSheet, setOpenSheet] = useState<
    'category' | 'account' | 'date' | null
  >(null)

  const cats = sortedCategories(categories)

  const applyToAll = (patch: Partial<Transaction>) => {
    if (selectedIds.length === 0) return
    bulkUpdate(selectedIds.map((id) => ({ id, patch })))
  }

  const setCleared = (cleared: boolean) => {
    applyToAll({ cleared })
    onClearSelection()
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent/10 border border-accent/20 px-3 py-2 text-sm">
        <span className="font-medium text-accent">
          {selectedIds.length} selected
        </span>
        <span className="flex-1" />
        <button
          className="btn"
          onClick={() => setCleared(true)}
          title="Mark all selected as cleared"
        >
          ✓ Mark cleared
        </button>
        <button
          className="btn"
          onClick={() => setCleared(false)}
          title="Mark all selected as uncleared"
        >
          ◯ Mark uncleared
        </button>
        <button className="btn" onClick={() => setOpenSheet('category')}>
          🏷 Category…
        </button>
        <button className="btn" onClick={() => setOpenSheet('account')}>
          🏦 Account…
        </button>
        <button className="btn" onClick={() => setOpenSheet('date')}>
          📅 Date…
        </button>
        <button className="btn btn-danger" onClick={onDelete}>
          🗑 Delete {selectedIds.length}
        </button>
        <button
          className="btn"
          onClick={onClearSelection}
          title="Clear selection"
        >
          ✕ Clear
        </button>
      </div>

      {openSheet === 'category' && (
        <BulkCategoryModal
          cats={cats}
          onClose={() => setOpenSheet(null)}
          onApply={(catId, subId) => {
            applyToAll({ catId, subId })
            setOpenSheet(null)
            onClearSelection()
          }}
        />
      )}
      {openSheet === 'account' && (
        <BulkAccountModal
          accounts={accounts.map((a) => ({ id: a.id, label: a.label }))}
          onClose={() => setOpenSheet(null)}
          onApply={(account) => {
            applyToAll({ account })
            setOpenSheet(null)
            onClearSelection()
          }}
        />
      )}
      {openSheet === 'date' && (
        <BulkDateModal
          onClose={() => setOpenSheet(null)}
          onApply={(date) => {
            applyToAll({ date })
            setOpenSheet(null)
            onClearSelection()
          }}
        />
      )}
    </>
  )
}

interface BulkCatProps {
  cats: ReturnType<typeof sortedCategories>
  onClose: () => void
  onApply: (catId: string, subId?: string) => void
}

function BulkCategoryModal({ cats, onClose, onApply }: BulkCatProps) {
  const [catId, setCatId] = useState(cats[0]?.id ?? '')
  const [subId, setSubId] = useState<string | undefined>(undefined)
  const cat = cats.find((c) => c.id === catId)
  const subs = [...(cat?.subs ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk re-categorize"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onApply(catId, subId)}
            disabled={!catId}
          >
            Apply
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Category</label>
          <select
            className="input mt-1"
            value={catId}
            onChange={(e) => {
              setCatId(e.target.value)
              setSubId(undefined)
            }}
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
            disabled={subs.length === 0}
            onChange={(e) => setSubId(e.target.value || undefined)}
          >
            <option value="">{subs.length === 0 ? '—' : 'None'}</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  )
}

interface BulkAcctProps {
  accounts: { id: AccountKind; label: string }[]
  onClose: () => void
  onApply: (account: AccountKind) => void
}

function BulkAccountModal({ accounts, onClose, onApply }: BulkAcctProps) {
  const [account, setAccount] = useState<AccountKind>(accounts[0]?.id ?? 'bank')
  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk reassign account"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onApply(account)}>
            Apply
          </button>
        </>
      }
    >
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
    </Modal>
  )
}

interface BulkDateProps {
  onClose: () => void
  onApply: (date: string) => void
}

function BulkDateModal({ onClose, onApply }: BulkDateProps) {
  const [date, setDate] = useState('')
  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk move to date"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!date}
            onClick={() => onApply(date)}
          >
            Apply
          </button>
        </>
      }
    >
      <p className="text-sm text-muted mb-2">
        All selected transactions will move to this date.
      </p>
      <DatePicker value={date} onChange={setDate} ariaLabel="Bulk new date" />
    </Modal>
  )
}
