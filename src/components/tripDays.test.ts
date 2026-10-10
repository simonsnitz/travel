import { describe, expect, it } from 'vitest'
import type { DaySummary, Trip } from '../lib/types'
import { adjacentDays, defaultDate, isUnderWay } from './tripDays'

const trip: Trip = {
  id: 't1',
  slug: 'india-nepal',
  title: 'India & Nepal',
  startDate: '2026-10-07',
  endDate: '2026-11-12',
  cover: null,
}
const day = (date: string): DaySummary => ({ tripId: 't1', date, location: '', published: true })
const days = [day('2026-10-07'), day('2026-10-08'), day('2026-10-11')]

describe('isUnderWay', () => {
  it('includes the first and the last day of the trip', () => {
    expect(isUnderWay(trip, '2026-10-06')).toBe(false)
    expect(isUnderWay(trip, '2026-10-07')).toBe(true)
    expect(isUnderWay(trip, '2026-11-12')).toBe(true)
    expect(isUnderWay(trip, '2026-11-13')).toBe(false)
  })
})

describe('defaultDate', () => {
  it('opens the latest entry while the trip is under way', () => {
    expect(defaultDate(trip, days, '2026-10-20')).toBe('2026-10-11')
  })

  it('opens the first entry before and after the trip', () => {
    expect(defaultDate(trip, days, '2026-09-30')).toBe('2026-10-07')
    expect(defaultDate(trip, days, '2027-01-01')).toBe('2026-10-07')
  })

  it('has nothing to open when nothing is posted', () => {
    expect(defaultDate(trip, [], '2026-10-20')).toBeUndefined()
  })
})

describe('adjacentDays', () => {
  const dates = (date: string) => {
    const { previous, next } = adjacentDays(days, date)
    return [previous?.date, next?.date]
  }

  it('finds the entries on either side', () => {
    expect(dates('2026-10-08')).toEqual(['2026-10-07', '2026-10-11'])
    expect(dates('2026-10-07')).toEqual([undefined, '2026-10-08'])
    expect(dates('2026-10-11')).toEqual(['2026-10-08', undefined])
  })

  it('works from a date that has no entry of its own', () => {
    expect(dates('2026-10-09')).toEqual(['2026-10-08', '2026-10-11'])
    expect(dates('2026-10-01')).toEqual([undefined, '2026-10-07'])
    expect(dates('2026-12-01')).toEqual(['2026-10-11', undefined])
  })

  it('offers nothing for something that is not a date', () => {
    expect(dates('yesterday')).toEqual([undefined, undefined])
  })
})
