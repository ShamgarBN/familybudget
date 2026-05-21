import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { todayISO } from '../../lib/dates'

interface Props {
  value?: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
}

/**
 * Try to parse a free-typed date string. Accepts:
 *   M/D/YY, M/D/YYYY, MM/DD/YYYY
 *   YYYY-MM-DD
 *   today, tomorrow, yesterday
 * Returns null if it can't be confidently parsed.
 */
function parseTypedDate(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (!s) return null
  if (s === 'today' || s === 't') return todayISO()
  if (s === 'tomorrow') {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return toISODate(d)
  }
  if (s === 'yesterday') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toISODate(d)
  }
  // Native ISO: 2026-05-15
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // US slash format: 5/15/26 or 5/15/2026
  const slash = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const yyyy = y.length === 2 ? `20${y}` : y
    const mm = Number(m)
    const dd = Number(d)
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }
  return null
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function parseLocalDate(iso?: string): Date {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return parseLocalDate(todayISO())
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function displayDate(iso?: string): string {
  if (!iso) return ''
  const d = parseLocalDate(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`
}

export function DatePicker({
  value,
  onChange,
  className,
  placeholder = 'Select date',
  ariaLabel = 'Choose date',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseLocalDate(value)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [typed, setTyped] = useState<string>(displayDate(value))

  const selected = value ? parseLocalDate(value) : null
  const today = parseLocalDate(todayISO())

  useEffect(() => {
    if (!open || !value) return
    const d = parseLocalDate(value)
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [open, value])

  // Keep the typed string in sync if the underlying value changes from outside.
  useEffect(() => {
    setTyped(displayDate(value))
  }, [value])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const days = useMemo(() => {
    const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const gridStart = new Date(first)
    gridStart.setDate(first.getDate() - first.getDay())

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + i)
      return d
    })
  }, [viewMonth])

  const shiftMonth = (offset: number) => {
    setViewMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + offset, 1))
  }

  const commitDate = (date: Date) => {
    onChange(toISODate(date))
    setOpen(false)
  }

  const commitTyped = () => {
    const parsed = parseTypedDate(typed)
    if (parsed) {
      if (parsed !== value) onChange(parsed)
      setTyped(displayDate(parsed))
    } else {
      // Restore the prior known good display.
      setTyped(displayDate(value))
    }
  }

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          aria-label={ariaLabel}
          className="input pr-7"
          value={typed}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitTyped()
              setOpen(false)
            } else if (e.key === 'Escape') {
              setTyped(displayDate(value))
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <button
          type="button"
          aria-label="Open calendar"
          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted hover:text-ink w-6 h-6 inline-flex items-center justify-center rounded"
          onMouseDown={(e) => {
            // Prevent input blur from collapsing the popup before we toggle.
            e.preventDefault()
            setOpen((v) => !v)
          }}
        >
          📅
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 rounded-xl border border-line bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="btn px-2 py-1"
              aria-label="Show previous month"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => shiftMonth(-1)}
            >
              ‹
            </button>
            <div className="font-semibold text-sm">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              className="btn px-2 py-1"
              aria-label="Show next month"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => shiftMonth(1)}
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted mb-1">
            {DOW.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const inMonth = d.getMonth() === viewMonth.getMonth()
              const isSelected = selected && sameDay(d, selected)
              const isToday = sameDay(d, today)

              return (
                <button
                  key={toISODate(d)}
                  type="button"
                  className={clsx(
                    'h-8 rounded-md text-sm transition',
                    inMonth ? 'text-ink' : 'text-muted/40',
                    isToday && !isSelected && 'ring-1 ring-accent/40',
                    isSelected
                      ? 'bg-accent text-white font-semibold'
                      : 'hover:bg-slate-100',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitDate(d)}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
