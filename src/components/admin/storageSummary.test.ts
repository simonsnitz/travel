import { describe, expect, it } from 'vitest'
import { formatSize, summariseStorage } from './storageSummary'

const GB = 1_000_000_000

describe('formatSize', () => {
  it('uses the unit that fits', () => {
    expect(formatSize(0)).toBe('0 MB')
    expect(formatSize(400)).toBe('1 KB')
    expect(formatSize(64_515)).toBe('65 KB')
    expect(formatSize(1_133_274)).toBe('1.1 MB')
    expect(formatSize(412_300_000)).toBe('412 MB')
    expect(formatSize(GB)).toBe('1 GB')
    expect(formatSize(1_240_000_000)).toBe('1.24 GB')
  })
})

describe('summariseStorage', () => {
  it('reports what is used against the allowance', () => {
    expect(summariseStorage(1_133_274, GB)).toEqual({ used: '1.1 MB', allowance: '1 GB', percent: 0, level: 'fine' })
    expect(summariseStorage(412_300_000, GB)).toMatchObject({ used: '412 MB', percent: 41, level: 'fine' })
  })

  it('warns from 80 percent, and says full at the limit', () => {
    expect(summariseStorage(799_000_000, GB).level).toBe('fine')
    expect(summariseStorage(800_000_000, GB)).toMatchObject({ percent: 80, level: 'filling' })
    expect(summariseStorage(GB, GB)).toMatchObject({ percent: 100, level: 'full' })
    // Over the limit, the bar stays full rather than overflowing.
    expect(summariseStorage(1_300_000_000, GB)).toMatchObject({ used: '1.3 GB', percent: 100, level: 'full' })
  })
})
