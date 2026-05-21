import { useEffect } from 'react'
import { useStore } from '../store/store'

interface Options {
  /** Open the New Transaction modal — bound to ⌘N. */
  onNewTransaction?: () => void
  /** Open the Settings modal — bound to ⌘, (Mac convention). */
  onOpenSettings?: () => void
}

/**
 * Wires global keyboard shortcuts:
 *   ⌘/Ctrl + Z   → undo
 *   ⌘/Ctrl + N   → new transaction
 *   ⌘/Ctrl + F   → focus search
 *   ⌘ + ,        → settings
 *   ↑ / ↓ inside ledger row cells → jump to same cell in adjacent row
 */
export function useGlobalKeys({ onNewTransaction, onOpenSettings }: Options = {}) {
  const undo = useStore((s) => s.undo)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()

      // Don't hijack typing inside contenteditable / inputs / textareas, except
      // for ⌘N which we accept anywhere because users expect it always works.
      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (meta && key === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (meta && key === 'n' && onNewTransaction) {
        e.preventDefault()
        onNewTransaction()
        return
      }
      if (meta && key === 'f') {
        e.preventDefault()
        const search = document.querySelector<HTMLInputElement>(
          'input[placeholder*="Search"]',
        )
        if (search) {
          search.focus()
          search.select()
        }
        return
      }
      if (meta && e.key === ',' && onOpenSettings) {
        e.preventDefault()
        onOpenSettings()
        return
      }

      // Arrow nav between rows when focus is on a contenteditable or input/select inside a row.
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (!target) return
      if (inEditable && (target as HTMLInputElement).type === 'number') {
        // Number inputs don't have meaningful arrow nav (we already disable
        // their spinners visually); allow row jumping.
      }
      const cell = target.closest('td')
      const row = target.closest('tr[data-tx-row="1"]')
      if (!cell || !row) return

      const rowParent = row.parentElement
      if (!rowParent) return
      const rows = Array.from(
        rowParent.querySelectorAll<HTMLTableRowElement>('tr[data-tx-row="1"]'),
      )
      const idx = rows.indexOf(row as HTMLTableRowElement)
      const nextRow = e.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1]
      if (!nextRow) return

      const cells = Array.from(row.children)
      const cellIdx = cells.indexOf(cell)
      const targetCell = nextRow.children[cellIdx] as HTMLTableCellElement | undefined
      if (!targetCell) return

      e.preventDefault()
      const focusable =
        targetCell.querySelector<HTMLElement>('input, select, [contenteditable="true"]') ??
        (targetCell.isContentEditable ? targetCell : null)
      focusable?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, onNewTransaction, onOpenSettings])
}
