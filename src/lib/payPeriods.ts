import { v4 as uuid } from 'uuid'
import type { PayPeriod, PayPeriodFrequency } from '../types'
import { addDays, addMonths, advance, fromISO, isAfter, isBefore, isEqual, toISO } from './dates'

/**
 * Build a single pay period that starts on the given date and matches the configured frequency.
 * Returns inclusive [start, end] in ISO yyyy-mm-dd.
 */
export function buildPeriod(startISO: string, freq: PayPeriodFrequency): PayPeriod {
  let endISO: string
  switch (freq) {
    case 'weekly':
      endISO = advance(startISO, 'day', 6)
      break
    case 'biweekly':
      endISO = advance(startISO, 'day', 13)
      break
    case 'monthly': {
      const next = addMonths(fromISO(startISO), 1)
      endISO = toISO(addDays(next, -1))
      break
    }
    case 'semimonthly': {
      const start = fromISO(startISO)
      // If start is on day 1-15, period ends day 15. Otherwise ends last day of month.
      if (start.getDate() <= 15) {
        const end = new Date(start.getFullYear(), start.getMonth(), 15)
        endISO = toISO(end)
      } else {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
        endISO = toISO(end)
      }
      break
    }
  }
  return { id: uuid(), start: startISO, end: endISO }
}

/** Compute the next start date after the given period end, given the frequency. */
export function nextStart(prevEndISO: string, freq: PayPeriodFrequency): string {
  if (freq === 'semimonthly') {
    const d = fromISO(prevEndISO)
    if (d.getDate() === 15) {
      return toISO(new Date(d.getFullYear(), d.getMonth(), 16))
    }
    return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 1))
  }
  return advance(prevEndISO, 'day', 1)
}

/** Return the period covering a given date, creating a chain of periods if needed. */
export function ensurePeriodForDate(
  periods: PayPeriod[],
  dateISO: string,
  anchorISO: string,
  freq: PayPeriodFrequency,
): { periods: PayPeriod[]; period: PayPeriod } {
  const found = periods.find((p) => withinPeriod(dateISO, p))
  if (found) return { periods, period: found }

  // Walk forward/backward from anchor until we land on a period covering dateISO.
  let chain = [...periods].sort((a, b) => a.start.localeCompare(b.start))
  if (chain.length === 0) {
    chain = [buildPeriod(anchorISO, freq)]
  }

  // Extend forward
  while (chain[chain.length - 1].end < dateISO) {
    const last = chain[chain.length - 1]
    chain.push(buildPeriod(nextStart(last.end, freq), freq))
  }
  // Extend backward. The previous period must END exactly one day before the
  // earliest known period and follow the configured cadence.
  while (chain[0].start > dateISO) {
    const first = chain[0]
    const prevEnd = toISO(addDays(fromISO(first.start), -1))
    let prevStart: string
    if (freq === 'weekly') {
      prevStart = advance(prevEnd, 'day', -6)
    } else if (freq === 'biweekly') {
      prevStart = advance(prevEnd, 'day', -13)
    } else if (freq === 'monthly') {
      // Monthly periods run from day-X-of-one-month through (day-X-1) of the
      // next. Going backward, prevStart = first.start minus one month.
      prevStart = toISO(addMonths(fromISO(first.start), -1))
    } else {
      // semimonthly: alternate halves of the calendar month.
      const d = fromISO(prevEnd)
      if (d.getDate() === 15) {
        prevStart = toISO(new Date(d.getFullYear(), d.getMonth(), 1))
      } else {
        // prevEnd is the last day of some month → prevStart is the 16th of that month.
        prevStart = toISO(new Date(d.getFullYear(), d.getMonth(), 16))
      }
    }
    chain.unshift({ ...buildPeriod(prevStart, freq), end: prevEnd })
  }

  const period = chain.find((p) => withinPeriod(dateISO, p))!
  return { periods: chain, period }
}

export function withinPeriod(dateISO: string, p: PayPeriod): boolean {
  const d = fromISO(dateISO)
  const s = fromISO(p.start)
  const e = fromISO(p.end)
  return (isAfter(d, s) || isEqual(d, s)) && (isBefore(d, e) || isEqual(d, e))
}

/** Sort pay periods chronologically. */
export const sortedPeriods = (ps: PayPeriod[]): PayPeriod[] =>
  [...ps].sort((a, b) => a.start.localeCompare(b.start))
