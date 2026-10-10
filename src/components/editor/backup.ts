import type { ISODate } from '../../lib/types'
import { toDrafts, type DraftBlock } from './blocks'

/** A copy of an unsaved draft, kept on this device in case the page closes or the connection drops. */
export interface Backup {
  location: string
  blocks: DraftBlock[]
  /** When the draft was last edited, in milliseconds since the epoch. */
  editedAt: number
}

type BackupStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const backupKey = (tripId: string, date: ISODate) => `travel:draft:${tripId}:${date}`

// Storage can be missing, full, or blocked (private browsing, embedded pages),
// and even reading the `localStorage` property can throw. A backup is a safety
// net, so every failure here is swallowed rather than allowed to break editing.
function deviceStorage(): BackupStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The backup stored under `key`, or null if there is none or it can't be read. */
export function readBackup(key: string, storage: BackupStorage | null = deviceStorage()): Backup | null {
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { location, blocks, editedAt } = value as Record<string, unknown>
    return {
      location: typeof location === 'string' ? location : '',
      blocks: toDrafts(blocks),
      editedAt: typeof editedAt === 'number' && Number.isFinite(editedAt) ? editedAt : 0,
    }
  } catch {
    return null
  }
}

/** Returns false if the backup could not be stored. */
export function writeBackup(key: string, backup: Backup, storage: BackupStorage | null = deviceStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, JSON.stringify(backup))
    return true
  } catch {
    return false
  }
}

export function clearBackup(key: string, storage: BackupStorage | null = deviceStorage()): void {
  try {
    storage?.removeItem(key)
  } catch {
    // Nothing useful to do: the backup is simply offered again next time.
  }
}

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const DATE_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "3:42 PM" for a time today, otherwise "Oct 9, 3:42 PM". Uses the device's own clock and timezone. */
export function formatBackupTime(editedAt: number, now: number = Date.now()): string {
  const then = new Date(editedAt)
  if (Number.isNaN(then.getTime()) || editedAt <= 0) return 'earlier'
  const sameDay = then.toDateString() === new Date(now).toDateString()
  return (sameDay ? TIME : DATE_TIME).format(then)
}
