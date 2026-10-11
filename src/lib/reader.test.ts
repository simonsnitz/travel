import { describe, expect, it, vi } from 'vitest'
import { UnreachableError } from './errors'
import { createReader } from './reader'
import { createSnapshot, type Snapshot } from './snapshot'
import type { Day, Trip } from './types'

const trip: Trip = { id: 't1', slug: 'india-nepal', title: 'India & Nepal', startDate: '2026-10-07', endDate: '2026-11-12', cover: null }
const day = (text: string): Day => ({
  tripId: 't1',
  date: '2026-10-07',
  location: 'Delhi',
  published: true,
  updatedAt: '2026-10-07T10:00:00Z',
  blocks: [{ id: 'a', type: 'text', text }],
})

const unreachable = () => Promise.reject(new UnreachableError("Couldn't reach the server."))
/** Lets a request that was started in the background finish. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function liveStore(overrides = {}) {
  return {
    listTrips: vi.fn(async () => [trip]),
    getTrip: vi.fn(async (slug: string) => (slug === trip.slug ? trip : null)),
    listDays: vi.fn(async () => [{ tripId: 't1', date: '2026-10-07', location: 'Delhi', published: true }]),
    getDay: vi.fn(async () => day('live')),
    mediaUrl: (path: string) => `https://live.test/${path}`,
    ...overrides,
  }
}

function backupCopy(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    index: vi.fn(async () => ({ version: 1, days: 1, latest: '2026-10-07T10:00:00Z', trips: [trip] })),
    listDays: vi.fn(async () => [{ tripId: 't1', date: '2026-10-07', location: 'Delhi', published: true }]),
    getDay: vi.fn(async () => day('copy')),
    mediaUrl: (path: string) => `https://site.test/snapshot/media/${path}`,
    ...overrides,
  }
}

describe('createReader', () => {
  it('reads from the live site while it answers, and never touches the copy', async () => {
    const copy = backupCopy()
    const reader = createReader(liveStore(), copy)
    expect(await reader.listTrips()).toEqual([trip])
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'live' })
    expect(reader.usingBackup()).toBe(false)
    expect(reader.mediaUrl('a/b.jpg')).toBe('https://live.test/a/b.jpg')
    expect(copy.index).not.toHaveBeenCalled()
    expect(copy.getDay).not.toHaveBeenCalled()
  })

  it('asks the live site for a single quick attempt, since there is a copy to fall back on', async () => {
    const live = liveStore()
    const reader = createReader(live, backupCopy())
    await reader.listTrips()
    await reader.getTrip('india-nepal')
    await reader.listDays('t1')
    await reader.getDay('t1', '2026-10-07')
    expect(live.listTrips).toHaveBeenCalledWith({ failFast: true })
    expect(live.getTrip).toHaveBeenCalledWith('india-nepal', { failFast: true })
    expect(live.listDays).toHaveBeenCalledWith('t1', { failFast: true })
    expect(live.getDay).toHaveBeenCalledWith('t1', '2026-10-07', { failFast: true })
  })

  it('serves the copy, photos included, when the live site cannot be reached', async () => {
    const time = 1_000_000
    const live = liveStore({ listTrips: vi.fn(unreachable), getTrip: vi.fn(unreachable), listDays: vi.fn(unreachable), getDay: vi.fn(unreachable) })
    const reader = createReader(live, backupCopy(), () => time)
    const changes = vi.fn()
    reader.subscribe(changes)

    expect(await reader.getTrip('india-nepal')).toEqual(trip)
    expect(await reader.getTrip('nowhere')).toBeNull()
    expect(await reader.listDays('t1')).toHaveLength(1)
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'copy' })
    expect(reader.usingBackup()).toBe(true)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(reader.mediaUrl('a/b.jpg')).toBe('https://site.test/snapshot/media/a/b.jpg')
    // Having failed once, the live site is left alone for a while rather than asked on every page.
    expect(live.getTrip).toHaveBeenCalledTimes(1)
    expect(live.listDays).not.toHaveBeenCalled()
    expect(live.getDay).not.toHaveBeenCalled()
  })

  it('tries the live site again in the background, and goes back to it once it answers', async () => {
    let time = 1_000_000
    let liveWorks = false
    const live = liveStore({
      listTrips: vi.fn(unreachable),
      getDay: vi.fn(() => (liveWorks ? Promise.resolve(day('live')) : unreachable())),
    })
    const reader = createReader(live, backupCopy(), () => time)
    await reader.listTrips()
    expect(reader.usingBackup()).toBe(true)

    // Too soon to ask again.
    time += 30_000
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'copy' })
    expect(live.getDay).not.toHaveBeenCalled()

    // Time to ask. The reader still gets the copy at once; the question is asked behind the scenes.
    time += 31_000
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'copy' })
    expect(live.getDay).toHaveBeenCalledTimes(1)
    await flush()

    // It failed, so the next question waits twice as long.
    time += 61_000
    await reader.getDay('t1', '2026-10-07')
    expect(live.getDay).toHaveBeenCalledTimes(1)
    time += 60_000
    liveWorks = true
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'copy' })
    expect(live.getDay).toHaveBeenCalledTimes(2)
    await flush()

    // It answered, so the next page is live again.
    expect((await reader.getDay('t1', '2026-10-07'))?.blocks[0]).toMatchObject({ text: 'live' })
    expect(reader.usingBackup()).toBe(false)
    expect(reader.mediaUrl('a/b.jpg')).toBe('https://live.test/a/b.jpg')
  })

  it('does not hide a real answer from the live site behind the copy', async () => {
    const notSetUp = new Error("The site's database isn't set up yet.")
    const copy = backupCopy()
    const reader = createReader(liveStore({ listTrips: vi.fn(() => Promise.reject(notSetUp)) }), copy)
    await expect(reader.listTrips()).rejects.toBe(notSetUp)
    expect(copy.index).not.toHaveBeenCalled()
    expect(reader.usingBackup()).toBe(false)
  })

  it('reports the original problem when there is no copy to fall back on', async () => {
    const problem = new UnreachableError("Couldn't reach the server.")
    const live = liveStore({ listTrips: vi.fn(() => Promise.reject(problem)) })
    const copy = backupCopy({ index: vi.fn(() => Promise.reject(new Error('There is no backup copy.'))) })
    const reader = createReader(live, copy)
    await expect(reader.listTrips()).rejects.toBe(problem)
    expect(reader.usingBackup()).toBe(false)
    // Nothing was served from the copy, so the next page asks the live site again.
    await expect(reader.listTrips()).rejects.toBe(problem)
    expect(live.listTrips).toHaveBeenCalledTimes(2)
  })

  it('is a plain pass-through when there is no copy at all (the demo)', async () => {
    const problem = new UnreachableError("Couldn't reach the server.")
    const reader = createReader(liveStore({ listTrips: vi.fn(() => Promise.reject(problem)) }), null)
    await expect(reader.listTrips()).rejects.toBe(problem)
    expect(reader.mediaUrl('a/b.jpg')).toBe('https://live.test/a/b.jpg')
  })
})

describe('createSnapshot', () => {
  const files: Record<string, unknown> = {
    'index.json': { version: 1, days: 1, latest: '2026-10-07T10:00:00Z', trips: [trip] },
    'days/t1.json': [{ tripId: 't1', date: '2026-10-07', location: 'Delhi', published: true, updatedAt: '2026-10-07T10:00:00Z' }],
    'day/t1/2026-10-07.json': day('copy'),
  }
  const fetchFile = vi.fn(async (url: string) => {
    const name = url.replace('https://site.test/snapshot/', '')
    const found = name in files
    return { ok: found, status: found ? 200 : 404, json: async () => files[name] }
  })
  const copy = createSnapshot('https://site.test/snapshot', fetchFile)

  it('reads the index once and reuses it', async () => {
    expect((await copy.index()).trips).toEqual([trip])
    await copy.index()
    expect(fetchFile.mock.calls.filter(([url]) => url.endsWith('index.json'))).toHaveLength(1)
  })

  it('reads days, and treats a missing file as nothing published', async () => {
    expect(await copy.listDays('t1')).toEqual([{ tripId: 't1', date: '2026-10-07', location: 'Delhi', published: true }])
    expect(await copy.listDays('t2')).toEqual([])
    expect((await copy.getDay('t1', '2026-10-07'))?.location).toBe('Delhi')
    expect(await copy.getDay('t1', '2026-10-08')).toBeNull()
  })

  it('never builds a file address from something that is not an id or a date', async () => {
    const before = fetchFile.mock.calls.length
    expect(await copy.listDays('../secrets')).toEqual([])
    expect(await copy.getDay('t1', '../../index')).toBeNull()
    expect(fetchFile.mock.calls).toHaveLength(before)
  })

  it('rejects when the site has no copy', async () => {
    const empty = createSnapshot('https://site.test/snapshot/', async () => ({ ok: false, status: 404, json: async () => null }))
    await expect(empty.index()).rejects.toThrow('There is no backup copy.')
  })

  it('points photos at the copy', () => {
    expect(copy.mediaUrl('t1/2026-10-07/a b.jpg')).toBe('https://site.test/snapshot/media/t1/2026-10-07/a%20b.jpg')
  })
})
