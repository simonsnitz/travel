import { UnreachableError } from './errors'
import type { Snapshot } from './snapshot'
import type { Store } from './store'
import type { Day, DaySummary, ISODate, Trip } from './types'

/** Everything a public page reads. */
export interface Reader {
  listTrips(): Promise<Trip[]>
  getTrip(slug: string): Promise<Trip | null>
  /** Published days only, in date order. */
  listDays(tripId: string): Promise<DaySummary[]>
  getDay(tripId: string, date: ISODate): Promise<Day | null>
  mediaUrl(path: string): string
  /** True when the last thing read came from the backup copy rather than the live site. */
  usingBackup(): boolean
  /** Calls back when `usingBackup()` changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}

const DOWN_KEY = 'travel-live-down'
/** After the live site fails, how long until it is quietly asked again. The wait doubles each time it fails, up to the longest. */
const FIRST_RETRY_MS = 60_000
const LONGEST_RETRY_MS = 5 * 60_000
/** A page loaded within this long of a failure starts from the copy, rather than waiting to find out again. */
const REMEMBER_MS = 10 * 60_000

/**
 * Reads from the live site and, when it can't be reached, from the backup copy.
 *
 * The copy is only a fallback: while the live site answers, readers always get
 * what was published a moment ago. Once it stops answering (the database is
 * paused or down, which is the whole reason the copy exists), pages come
 * straight from the copy with no waiting, and the live site is tried again in
 * the background every so often. Pass `backup: null` (the demo) to read from
 * `live` alone.
 */
export function createReader(
  live: Pick<Store, 'listTrips' | 'getTrip' | 'listDays' | 'getDay' | 'mediaUrl'>,
  backup: Snapshot | null,
  now: () => number = Date.now,
): Reader {
  const listeners = new Set<() => void>()
  // Kept across page loads, so that every page of a visit doesn't wait to find out again.
  let down = backup !== null && now() - recallFailure() < REMEMBER_MS
  let retryAt = now()
  let retryDelay = FIRST_RETRY_MS
  let retrying = false
  let servingBackup = false

  const served = (fromBackup: boolean) => {
    if (servingBackup === fromBackup) return
    servingBackup = fromBackup
    listeners.forEach((listener) => listener())
  }

  const failed = () => {
    retryDelay = down ? Math.min(retryDelay * 2, LONGEST_RETRY_MS) : FIRST_RETRY_MS
    down = true
    retryAt = now() + retryDelay
    rememberFailure(now())
  }

  const recovered = () => {
    down = false
    rememberFailure(0)
  }

  /** Asks the live site again without making anyone wait for the answer. The next page uses whatever it finds. */
  function retryInBackground(fromLive: () => Promise<unknown>) {
    if (retrying || now() < retryAt) return
    retrying = true
    fromLive()
      .then(recovered, (error: unknown) => {
        // Any answer other than "couldn't reach it" means the server is back.
        if (error instanceof UnreachableError) failed()
        else recovered()
      })
      .finally(() => {
        retrying = false
      })
  }

  async function read<T>(fromLive: () => Promise<T>, fromBackup: (copy: Snapshot) => Promise<T>): Promise<T> {
    if (!backup) return fromLive()

    if (down) {
      retryInBackground(fromLive)
      try {
        const value = await fromBackup(backup)
        served(true)
        return value
      } catch {
        // The copy has gone too, so the live site is the only thing left to ask.
      }
      const value = await fromLive()
      recovered()
      served(false)
      return value
    }

    try {
      const value = await fromLive()
      served(false)
      return value
    } catch (error) {
      // Anything but "couldn't reach it" is a real answer, and the copy mustn't paper over it.
      if (!(error instanceof UnreachableError)) throw error
      let value: T
      try {
        value = await fromBackup(backup)
      } catch {
        // No copy to fall back on, so the original problem is the one to report.
        throw error
      }
      failed()
      served(true)
      return value
    }
  }

  // With a copy to fall back on, one quick attempt beats a patient one: a
  // reader shouldn't wait through retries for a database that is paused.
  const attempt = backup ? { failFast: true } : undefined

  return {
    listTrips: () =>
      read(
        () => live.listTrips(attempt),
        async (copy) => (await copy.index()).trips,
      ),
    getTrip: (slug) =>
      read(
        () => live.getTrip(slug, attempt),
        async (copy) => (await copy.index()).trips.find((trip) => trip.slug === slug) ?? null,
      ),
    listDays: (tripId) =>
      read(
        () => live.listDays(tripId, attempt),
        (copy) => copy.listDays(tripId),
      ),
    getDay: (tripId, date) =>
      read(
        () => live.getDay(tripId, date, attempt),
        (copy) => copy.getDay(tripId, date),
      ),
    // Photos and clips come from wherever the page's text came from: when the
    // database is down, so is its file storage.
    mediaUrl: (path) => (backup && servingBackup ? backup.mediaUrl(path) : live.mediaUrl(path)),
    usingBackup: () => servingBackup,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** When the live site last failed in this tab, or 0 if it hasn't. */
function recallFailure(): number {
  try {
    return Number(sessionStorage.getItem(DOWN_KEY)) || 0
  } catch {
    return 0
  }
}

function rememberFailure(at: number): void {
  try {
    if (at) sessionStorage.setItem(DOWN_KEY, String(at))
    else sessionStorage.removeItem(DOWN_KEY)
  } catch {
    // Storage can be unavailable (private browsing). The value in memory still works for this page.
  }
}
