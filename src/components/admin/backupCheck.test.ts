import { describe, expect, it } from 'vitest'
import { backupStatus } from './backupCheck'

const live = { days: 3, latest: '2026-10-10T08:00:00.123456+00:00' }

describe('backupStatus', () => {
  it('is current when the copy holds the same days, last saved at the same moment', () => {
    expect(backupStatus(live, { ...live }, 'active')).toBe('current')
    // The same instant, spelled differently.
    expect(backupStatus({ days: 3, latest: '2026-10-10T08:00:00+00:00' }, { days: 3, latest: '2026-10-10T08:00:00Z' }, 'active')).toBe('current')
    expect(backupStatus({ days: 0, latest: null }, { days: 0, latest: null }, 'active')).toBe('current')
  })

  it('is behind after anything is published, edited, unpublished or deleted', () => {
    expect(backupStatus({ days: 4, latest: '2026-10-11T08:00:00+00:00' }, live, 'active')).toBe('behind')
    expect(backupStatus({ ...live, latest: '2026-10-10T09:30:00+00:00' }, live, 'active')).toBe('behind')
    expect(backupStatus({ ...live, days: 2 }, live, 'active')).toBe('behind')
    expect(backupStatus({ days: 0, latest: null }, live, 'active')).toBe('behind')
  })

  it('is missing when the site has no copy', () => {
    expect(backupStatus(live, null, 'active')).toBe('missing')
  })

  it('says so first when GitHub has stopped the daily run', () => {
    expect(backupStatus(live, { ...live }, 'off')).toBe('off')
    expect(backupStatus(live, null, 'off')).toBe('off')
  })

  it('does not raise the alarm when GitHub could not be asked', () => {
    expect(backupStatus(live, { ...live }, 'unknown')).toBe('current')
  })
})
