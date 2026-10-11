import { isISODate } from './dates'
import type { Day, DaySummary, ISODate, PublishedState, Trip } from './types'

/** The contents of snapshot/index.json, as written by scripts/snapshot.mjs. */
export interface SnapshotIndex extends PublishedState {
  version: number
  trips: Trip[]
}

/**
 * The backup copy of everything published: plain files served beside the site
 * itself, so they stay readable when the database is not. The copy is written
 * by scripts/snapshot.mjs and only ever read here.
 */
export interface Snapshot {
  /** Rejects if there is no copy, or it can't be fetched. */
  index(): Promise<SnapshotIndex>
  listDays(tripId: string): Promise<DaySummary[]>
  getDay(tripId: string, date: ISODate): Promise<Day | null>
  mediaUrl(path: string): string
}

type FetchFile = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export function createSnapshot(baseUrl: string, fetchFile: FetchFile = (url) => fetch(url)): Snapshot {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  let cachedIndex: Promise<SnapshotIndex> | null = null

  /** The parsed file, or undefined if the copy has no such file. */
  async function read(path: string): Promise<unknown> {
    const response = await fetchFile(base + path)
    if (response.status === 404) return undefined
    if (!response.ok) throw new Error(`The backup copy answered ${response.status}.`)
    return response.json()
  }

  return {
    index() {
      if (cachedIndex) return cachedIndex
      const loading = read('index.json').then((value) => {
        if (!isIndex(value)) throw new Error('There is no backup copy.')
        return value
      })
      cachedIndex = loading
      // A failure isn't remembered, so the next page asks again.
      loading.catch(() => {
        if (cachedIndex === loading) cachedIndex = null
      })
      return loading
    },
    async listDays(tripId) {
      if (!isFileName(tripId)) return []
      const value = await read(`days/${tripId}.json`)
      return Array.isArray(value) ? value.filter(isRecord).map(toSummary) : []
    },
    async getDay(tripId, date) {
      if (!isFileName(tripId) || !isISODate(date)) return null
      const value = await read(`day/${tripId}/${date}.json`)
      return isDay(value) ? value : null
    },
    mediaUrl: (path) => `${base}media/${path.split('/').map(encodeURIComponent).join('/')}`,
  }
}

// The copy is fetched over the network, so its shape is checked rather than assumed.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Trip ids become file names in the copy, so anything that isn't a plain name is turned away. */
const isFileName = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value)

function isIndex(value: unknown): value is SnapshotIndex {
  return isRecord(value) && Array.isArray(value.trips) && typeof value.days === 'number'
}

function isDay(value: unknown): value is Day {
  return isRecord(value) && typeof value.date === 'string' && Array.isArray(value.blocks)
}

function toSummary(entry: Record<string, unknown>): DaySummary {
  return {
    tripId: String(entry.tripId ?? ''),
    date: String(entry.date ?? ''),
    location: String(entry.location ?? ''),
    // Only published days are ever copied.
    published: true,
  }
}
