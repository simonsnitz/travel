// The parts of snapshot.mjs that need no network or disk, kept apart so they can be tested.

/**
 * Whether a storage path or trip id is safe to use as a file path inside the
 * backup folder. Paths come out of the database, so they are checked before
 * anything is written to disk: no absolute paths, no "..", no odd characters.
 */
export function isSafePath(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(value)
}

const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

// Rows become the shapes the site reads (src/lib/types.ts), so the browser can use the files as they are.
const toTrip = (row) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  startDate: row.start_date,
  endDate: row.end_date,
  cover: row.cover ?? null,
})

const toDay = (row) => ({
  tripId: row.trip_id,
  date: row.date,
  location: row.location ?? '',
  published: true,
  blocks: Array.isArray(row.blocks) ? row.blocks : [],
  updatedAt: row.updated_at,
})

// The same content always produces the same text, so a run with nothing new changes no file.
const json = (value) => `${JSON.stringify(value, null, 2)}\n`

/**
 * Turns database rows into the backup copy: each JSON file as path → text, and
 * the storage path of every photo and clip those files refer to.
 *
 *   index.json                  the trips, plus how much is published
 *   days/<trip id>.json         a trip's published days, without their content
 *   day/<trip id>/<date>.json   one day in full
 */
export function buildSnapshot(tripRows, dayRows) {
  const trips = tripRows
    .filter((row) => isSafePath(row.id))
    .map(toTrip)
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id))
  const tripIds = new Set(trips.map((trip) => trip.id))
  const days = dayRows
    .filter((row) => row.published === true && tripIds.has(row.trip_id) && isDate(row.date))
    .map(toDay)
    .sort((a, b) => a.tripId.localeCompare(b.tripId) || a.date.localeCompare(b.date))

  let latest = null
  for (const day of days) {
    if (latest === null || Date.parse(day.updatedAt) > Date.parse(latest)) latest = day.updatedAt
  }

  const files = new Map()
  // `days` and `latest` match Store.publishedState(), which is how the admin page tells whether the copy is current.
  files.set('index.json', json({ version: 1, days: days.length, latest, trips }))
  for (const trip of trips) {
    const own = days.filter((day) => day.tripId === trip.id)
    const summaries = own.map(({ tripId, date, location, published, updatedAt }) => ({ tripId, date, location, published, updatedAt }))
    files.set(`days/${trip.id}.json`, json(summaries))
    for (const day of own) files.set(`day/${trip.id}/${day.date}.json`, json(day))
  }

  const media = new Set()
  const skipped = new Set()
  const add = (path) => {
    if (typeof path !== 'string' || path === '') return
    if (isSafePath(path)) media.add(path)
    else skipped.add(path)
  }
  for (const trip of trips) {
    add(trip.cover?.path)
    add(trip.cover?.thumbPath)
  }
  for (const day of days) {
    for (const block of day.blocks) {
      if (block?.type === 'photos' && Array.isArray(block.photos)) {
        for (const photo of block.photos) {
          add(photo?.path)
          add(photo?.thumbPath)
        }
      }
      if (block?.type === 'video' && block.source === 'upload') add(block.path)
    }
  }

  return {
    files,
    media: [...media].sort(),
    /** Paths that were not copied because they are not plain file paths. */
    skipped: [...skipped].sort(),
    counts: { trips: trips.length, days: days.length },
  }
}

/**
 * True if the new copy would wipe a backup that has content. An ordinary edit
 * never does that, but a broken or freshly reset database would, and a backup
 * that empties itself along with the thing it backs up is no backup.
 */
export function wouldEmpty(previous, next) {
  if (!previous) return false
  return (previous.trips > 0 && next.trips === 0) || (previous.days > 0 && next.days === 0)
}

/** Reads NAME=value lines the way Vite does: the last assignment wins, and quotes and a leading "export" are dropped. */
export function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}
