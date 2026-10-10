import { eachDate } from '../../lib/dates'
import type { DaySummary, ISODate, Trip } from '../../lib/types'

export interface DayRow {
  date: ISODate
  /** 1 for the trip's first day and so on, or null for a day outside the trip's dates. */
  number: number | null
  /** What has been saved for this date, or null if nothing has been written yet. */
  entry: DaySummary | null
}

/**
 * One row per date of the trip, joined with the days written so far. A written
 * day that falls outside the trip's dates (the trip may have been shortened
 * since) still gets a row, so that no entry is ever hidden.
 */
export function dayRows(trip: Pick<Trip, 'startDate' | 'endDate'>, days: DaySummary[]): DayRow[] {
  const written = new Map(days.map((day) => [day.date, day]))
  const rows: DayRow[] = eachDate(trip.startDate, trip.endDate).map((date, index) => {
    const entry = written.get(date) ?? null
    written.delete(date)
    return { date, number: index + 1, entry }
  })
  // Whatever is left was written for a date the trip doesn't cover.
  for (const entry of written.values()) rows.push({ date: entry.date, number: null, entry })
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}
