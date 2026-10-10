import { isISODate, today } from '../lib/dates'
import type { DaySummary, ISODate, Trip } from '../lib/types'

/** Whether `now` (by default today, where the reader is) falls within the trip's dates. */
export function isUnderWay(trip: Trip, now: ISODate = today()): boolean {
  return trip.startDate <= now && now <= trip.endDate
}

/**
 * The day to open when the address names only the trip. During the trip that is
 * the latest entry, because returning readers want the news; before and after,
 * the story starts at the beginning. `days` must be in date order.
 */
export function defaultDate(trip: Trip, days: DaySummary[], now: ISODate = today()): ISODate | undefined {
  if (days.length === 0) return undefined
  return (isUnderWay(trip, now) ? days[days.length - 1] : days[0]).date
}

/**
 * The entries before and after `date`. The date doesn't have to have an entry
 * of its own, so a day with nothing posted still leads on to its neighbors.
 * `days` must be in date order.
 */
export function adjacentDays(days: DaySummary[], date: string): { previous?: DaySummary; next?: DaySummary } {
  if (!isISODate(date)) return {}
  let previous: DaySummary | undefined
  for (const day of days) {
    if (day.date < date) previous = day
    else if (day.date > date) return { previous, next: day }
  }
  return { previous }
}
