import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isEqual,
  parseISO,
  startOfDay,
} from 'date-fns'

export const todayISO = (): string => format(new Date(), 'yyyy-MM-dd')

export const toISO = (d: Date): string => format(d, 'yyyy-MM-dd')

export const fromISO = (iso: string): Date => parseISO(iso)

export const fmtShort = (iso: string): string => format(parseISO(iso), 'MMM d')
export const fmtMid = (iso: string): string => format(parseISO(iso), 'MMM d, yyyy')

export const dayInRange = (iso: string, startISO: string, endISO: string): boolean => {
  const d = startOfDay(parseISO(iso))
  const s = startOfDay(parseISO(startISO))
  const e = startOfDay(parseISO(endISO))
  return (
    (isAfter(d, s) || isEqual(d, s)) && (isBefore(d, e) || isEqual(d, e))
  )
}

export const advance = (
  iso: string,
  kind: 'day' | 'week' | 'month' | 'year',
  amount: number,
): string => {
  const d = parseISO(iso)
  if (kind === 'day') return toISO(addDays(d, amount))
  if (kind === 'week') return toISO(addWeeks(d, amount))
  if (kind === 'month') return toISO(addMonths(d, amount))
  return toISO(addYears(d, amount))
}

/** Generate a clean default label for a pay period range. */
export const periodLabel = (startISO: string, endISO: string): string => {
  const a = parseISO(startISO)
  const b = parseISO(endISO)
  const sameYear = a.getFullYear() === b.getFullYear()
  return sameYear
    ? `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`
    : `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`
}

export { addDays, addMonths, addWeeks, addYears, endOfMonth, isAfter, isBefore, isEqual }
