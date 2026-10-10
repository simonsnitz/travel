import type { ISODate } from './types'

// Dates are plain calendar dates, so all arithmetic and formatting is done in
// UTC to keep a day from shifting with the viewer's timezone.
const toDate = (date: ISODate) => new Date(`${date}T00:00:00Z`)
const toISO = (date: Date): ISODate => date.toISOString().slice(0, 10)
const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options })

const LONG = formatter({ month: 'long', day: 'numeric' })
const SHORT = formatter({ month: 'short', day: 'numeric' })
const WEEKDAY = formatter({ weekday: 'long' })

/** "October 14" */
export const formatDay = (date: ISODate) => LONG.format(toDate(date))

/** "Oct 14" */
export const formatDayShort = (date: ISODate) => SHORT.format(toDate(date))

/** "Wednesday" */
export const formatWeekday = (date: ISODate) => WEEKDAY.format(toDate(date))

/** "October 7 – November 12, 2026" */
export function formatRange(start: ISODate, end: ISODate): string {
  const [startYear, startMonth] = start.split('-')
  const [endYear, endMonth, endDay] = end.split('-')
  if (startYear !== endYear) return `${formatDay(start)}, ${startYear} – ${formatDay(end)}, ${endYear}`
  if (startMonth !== endMonth) return `${formatDay(start)} – ${formatDay(end)}, ${endYear}`
  if (start === end) return `${formatDay(start)}, ${endYear}`
  return `${formatDay(start)} – ${Number(endDay)}, ${endYear}`
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = toDate(value)
  return !Number.isNaN(date.getTime()) && toISO(date) === value
}

/** Every date from `start` to `end`, inclusive. Empty if the range is invalid or backwards. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  if (!isISODate(start) || !isISODate(end)) return []
  const dates: ISODate[] = []
  const cursor = toDate(start)
  const last = toDate(end).getTime()
  // The cap keeps a mistyped year from producing an enormous list.
  while (cursor.getTime() <= last && dates.length < 1000) {
    dates.push(toISO(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

/** 1 for the trip's first day, 2 for the next, and so on. */
export function dayNumber(tripStart: ISODate, date: ISODate): number {
  return Math.round((toDate(date).getTime() - toDate(tripStart).getTime()) / 86_400_000) + 1
}

/** Today's date where the viewer is. */
export function today(): ISODate {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
