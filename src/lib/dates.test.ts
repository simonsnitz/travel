import { describe, expect, it } from 'vitest'
import { dayNumber, eachDate, formatDay, formatDayShort, formatRange, formatWeekday, isISODate } from './dates'

describe('dates', () => {
  it('formats single days', () => {
    expect(formatDay('2026-10-14')).toBe('October 14')
    expect(formatDayShort('2026-10-14')).toBe('Oct 14')
    expect(formatWeekday('2026-10-14')).toBe('Wednesday')
  })

  it('formats ranges', () => {
    expect(formatRange('2026-10-07', '2026-11-12')).toBe('October 7 – November 12, 2026')
    expect(formatRange('2026-10-07', '2026-10-12')).toBe('October 7 – 12, 2026')
    expect(formatRange('2026-10-07', '2026-10-07')).toBe('October 7, 2026')
    expect(formatRange('2026-12-28', '2027-01-04')).toBe('December 28, 2026 – January 4, 2027')
  })

  it('validates ISO dates', () => {
    expect(isISODate('2026-10-14')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('october-14')).toBe(false)
    expect(isISODate('2026-1-4')).toBe(false)
  })

  it('lists every date in a range', () => {
    const dates = eachDate('2026-10-07', '2026-11-12')
    expect(dates).toHaveLength(37)
    expect(dates[0]).toBe('2026-10-07')
    expect(dates[25]).toBe('2026-11-01')
    expect(dates.at(-1)).toBe('2026-11-12')
    expect(eachDate('2026-11-12', '2026-10-07')).toEqual([])
    expect(eachDate('nope', '2026-10-07')).toEqual([])
  })

  it('numbers days from the start of the trip', () => {
    expect(dayNumber('2026-10-07', '2026-10-07')).toBe(1)
    expect(dayNumber('2026-10-07', '2026-10-14')).toBe(8)
    expect(dayNumber('2026-10-07', '2026-11-12')).toBe(37)
  })
})
