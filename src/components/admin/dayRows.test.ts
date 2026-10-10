import { describe, expect, it } from 'vitest'
import type { DaySummary } from '../../lib/types'
import { dayRows } from './dayRows'

const trip = { startDate: '2026-10-07', endDate: '2026-10-10' }
const day = (date: string, published = true): DaySummary => ({ tripId: 'trip', date, location: '', published })

describe('dayRows', () => {
  it('lists every date of the trip, numbered, with its entry if there is one', () => {
    const draft = day('2026-10-08', false)
    expect(dayRows(trip, [draft])).toEqual([
      { date: '2026-10-07', number: 1, entry: null },
      { date: '2026-10-08', number: 2, entry: draft },
      { date: '2026-10-09', number: 3, entry: null },
      { date: '2026-10-10', number: 4, entry: null },
    ])
  })

  it('keeps days outside the trip dates, unnumbered and in date order', () => {
    const before = day('2026-10-05')
    const after = day('2026-10-12')
    const rows = dayRows(trip, [after, day('2026-10-07'), before])
    expect(rows.map((row) => row.date)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-12',
    ])
    expect(rows[0]).toEqual({ date: '2026-10-05', number: null, entry: before })
    expect(rows[1].number).toBe(1)
    expect(rows.at(-1)).toEqual({ date: '2026-10-12', number: null, entry: after })
  })

  it('still lists written days when the trip dates are unusable', () => {
    const written = day('2026-10-08')
    expect(dayRows({ startDate: '', endDate: '' }, [written])).toEqual([
      { date: '2026-10-08', number: null, entry: written },
    ])
  })
})
