import { describe, expect, it } from 'vitest'
import { backupKey, clearBackup, formatBackupTime, readBackup, writeBackup, type Backup } from './backup'

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

const brokenStorage = {
  getItem(): string | null {
    throw new Error('blocked')
  },
  setItem(): void {
    throw new DOMException('full', 'QuotaExceededError')
  },
  removeItem(): void {
    throw new Error('blocked')
  },
}

const key = backupKey('trip', '2026-10-14')
const backup: Backup = {
  location: 'Varanasi',
  blocks: [
    { id: 'a', type: 'text', text: 'Half a sentence ' },
    { id: 'b', type: 'video', source: 'embed', path: '', url: 'youtu', caption: '' },
  ],
  editedAt: 1_790_000_000_000,
}

describe('local backup', () => {
  it('keeps one backup per trip and date', () => {
    expect(backupKey('trip', '2026-10-14')).not.toBe(backupKey('trip', '2026-10-15'))
    expect(backupKey('trip', '2026-10-14')).not.toBe(backupKey('other', '2026-10-14'))
  })

  it('reads back what it wrote', () => {
    const storage = memoryStorage()
    expect(writeBackup(key, backup, storage)).toBe(true)
    expect(readBackup(key, storage)).toEqual(backup)
    expect(readBackup(backupKey('trip', '2026-10-15'), storage)).toBeNull()
  })

  it('clears a backup', () => {
    const storage = memoryStorage()
    writeBackup(key, backup, storage)
    clearBackup(key, storage)
    expect(readBackup(key, storage)).toBeNull()
  })

  it('never throws when storage is missing, blocked, or full', () => {
    expect(readBackup(key, brokenStorage)).toBeNull()
    expect(writeBackup(key, backup, brokenStorage)).toBe(false)
    expect(() => clearBackup(key, brokenStorage)).not.toThrow()
    expect(readBackup(key, null)).toBeNull()
    expect(writeBackup(key, backup, null)).toBe(false)
    expect(() => clearBackup(key, null)).not.toThrow()
    // In the test runner there is no localStorage at all, which must be fine too.
    expect(() => readBackup(key)).not.toThrow()
  })

  it('treats anything unreadable as no backup', () => {
    expect(readBackup(key, memoryStorage({ [key]: '{not json' }))).toBeNull()
    expect(readBackup(key, memoryStorage({ [key]: '"a string"' }))).toBeNull()
    expect(readBackup(key, memoryStorage({ [key]: 'null' }))).toBeNull()
    expect(readBackup(key, memoryStorage({ [key]: '' }))).toBeNull()
  })

  it('salvages what it can from a backup in an unexpected shape', () => {
    const odd = { location: 7, blocks: [{ id: 'a', type: 'text', text: 'Kept' }, { type: 'mystery' }, null], editedAt: 'yesterday' }
    expect(readBackup(key, memoryStorage({ [key]: JSON.stringify(odd) }))).toEqual({
      location: '',
      blocks: [{ id: 'a', type: 'text', text: 'Kept' }],
      editedAt: 0,
    })
    expect(readBackup(key, memoryStorage({ [key]: '{}' }))).toEqual({ location: '', blocks: [], editedAt: 0 })
  })
})

describe('formatBackupTime', () => {
  const at = (hours: number, minutes: number, day = 14) => new Date(2026, 9, day, hours, minutes).getTime()
  // Some runtimes put a narrow no-break space in front of AM and PM.
  const plain = (value: string) => value.replace(/\s/g, ' ')

  it('shows only the time for today', () => {
    expect(plain(formatBackupTime(at(15, 42), at(18, 0)))).toBe('3:42 PM')
  })

  it('adds the date for another day', () => {
    expect(plain(formatBackupTime(at(15, 42, 9), at(18, 0)))).toBe('Oct 9, 3:42 PM')
  })

  it('copes with a missing time', () => {
    expect(formatBackupTime(0)).toBe('earlier')
    expect(formatBackupTime(Number.NaN)).toBe('earlier')
  })
})
