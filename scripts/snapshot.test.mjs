import { describe, expect, it } from 'vitest'
import { buildSnapshot, isSafePath, parseEnv, wouldEmpty } from './snapshot-lib.mjs'

const tripRow = (id, start, extra = {}) => ({
  id,
  slug: `trip-${id}`,
  title: `Trip ${id}`,
  start_date: start,
  end_date: start,
  cover: null,
  created_at: '2026-01-01T00:00:00+00:00',
  ...extra,
})

const dayRow = (tripId, date, extra = {}) => ({
  trip_id: tripId,
  date,
  location: 'Somewhere',
  blocks: [],
  published: true,
  updated_at: `${date}T10:00:00+00:00`,
  ...extra,
})

const photo = (name) => ({ path: `t1/2026-10-07/${name}.jpg`, thumbPath: `t1/2026-10-07/${name}_thumb.jpg`, width: 4, height: 3 })

describe('buildSnapshot', () => {
  it('writes an index, a list of days per trip, and a file per day', () => {
    const { files, counts } = buildSnapshot(
      [tripRow('t1', '2026-10-07'), tripRow('t2', '2027-04-01')],
      [dayRow('t1', '2026-10-08'), dayRow('t1', '2026-10-07')],
    )
    expect([...files.keys()].sort()).toEqual([
      'day/t1/2026-10-07.json',
      'day/t1/2026-10-08.json',
      'days/t1.json',
      'days/t2.json',
      'index.json',
    ])
    expect(counts).toEqual({ trips: 2, days: 2 })

    const index = JSON.parse(files.get('index.json'))
    expect(index.trips.map((trip) => trip.id)).toEqual(['t2', 't1']) // newest trip first
    expect(index.trips[1]).toEqual({ id: 't1', slug: 'trip-t1', title: 'Trip t1', startDate: '2026-10-07', endDate: '2026-10-07', cover: null })
    expect(index).toMatchObject({ version: 1, days: 2, latest: '2026-10-08T10:00:00+00:00' })

    expect(JSON.parse(files.get('days/t1.json')).map((day) => day.date)).toEqual(['2026-10-07', '2026-10-08'])
    expect(JSON.parse(files.get('days/t2.json'))).toEqual([])
    expect(JSON.parse(files.get('day/t1/2026-10-07.json'))).toEqual({
      tripId: 't1',
      date: '2026-10-07',
      location: 'Somewhere',
      published: true,
      blocks: [],
      updatedAt: '2026-10-07T10:00:00+00:00',
    })
  })

  it('never copies drafts, or days whose trip is missing', () => {
    const { files, counts } = buildSnapshot(
      [tripRow('t1', '2026-10-07')],
      [dayRow('t1', '2026-10-07', { published: false }), dayRow('gone', '2026-10-07')],
    )
    expect(counts.days).toBe(0)
    expect([...files.keys()].sort()).toEqual(['days/t1.json', 'index.json'])
    expect(JSON.parse(files.get('index.json')).latest).toBeNull()
  })

  it('produces the same text for the same content, whatever order the rows arrive in', () => {
    const trips = [tripRow('t1', '2026-10-07'), tripRow('t2', '2027-04-01')]
    const days = [dayRow('t1', '2026-10-07'), dayRow('t2', '2027-04-01'), dayRow('t1', '2026-10-08')]
    const forwards = buildSnapshot(trips, days).files
    const backwards = buildSnapshot([...trips].reverse(), [...days].reverse()).files
    expect([...backwards.entries()].sort()).toEqual([...forwards.entries()].sort())
  })

  it('collects every photo and uploaded clip, but not embedded links', () => {
    const blocks = [
      { id: 'a', type: 'text', text: 'hello' },
      { id: 'b', type: 'photos', photos: [photo('one'), photo('two')] },
      { id: 'c', type: 'video', source: 'upload', path: 't1/2026-10-07/clip.mov' },
      { id: 'd', type: 'video', source: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' },
    ]
    const cover = { path: 't1/cover/c.jpg', thumbPath: 't1/cover/c_thumb.jpg', width: 4, height: 3 }
    const { media } = buildSnapshot([tripRow('t1', '2026-10-07', { cover })], [dayRow('t1', '2026-10-07', { blocks })])
    expect(media).toEqual([
      't1/2026-10-07/clip.mov',
      't1/2026-10-07/one.jpg',
      't1/2026-10-07/one_thumb.jpg',
      't1/2026-10-07/two.jpg',
      't1/2026-10-07/two_thumb.jpg',
      't1/cover/c.jpg',
      't1/cover/c_thumb.jpg',
    ])
  })

  it('refuses paths that could land outside the backup folder', () => {
    const blocks = [
      { id: 'a', type: 'photos', photos: [{ path: '../../etc/passwd', thumbPath: '/absolute.jpg', width: 1, height: 1 }] },
      { id: 'b', type: 'video', source: 'upload', path: 't1/ok.mp4' },
    ]
    const { media, skipped } = buildSnapshot([tripRow('t1', '2026-10-07')], [dayRow('t1', '2026-10-07', { blocks })])
    expect(media).toEqual(['t1/ok.mp4'])
    expect(skipped).toEqual(['../../etc/passwd', '/absolute.jpg'])
  })

  it('survives blocks that are not shaped as expected', () => {
    const blocks = [null, { type: 'photos' }, { type: 'photos', photos: [null, {}] }, { type: 'video', source: 'upload' }]
    expect(buildSnapshot([tripRow('t1', '2026-10-07')], [dayRow('t1', '2026-10-07', { blocks })]).media).toEqual([])
  })
})

describe('isSafePath', () => {
  it('accepts storage paths and ids', () => {
    for (const value of ['84a2bb32-a7fc-40fe-93ff-302be175640d', 'a/2026-10-07/b_thumb.jpg', 'a/cover/x.mov']) {
      expect(isSafePath(value), value).toBe(true)
    }
  })

  it('rejects anything that is not a plain relative path', () => {
    for (const value of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a/.hidden', 'a b', 'a\\b', 'a/b/', undefined, 7]) {
      expect(isSafePath(value), String(value)).toBe(false)
    }
  })
})

describe('wouldEmpty', () => {
  it('lets a first copy and ordinary changes through', () => {
    expect(wouldEmpty(null, { trips: 0, days: 0 })).toBe(false)
    expect(wouldEmpty({ trips: 1, days: 5 }, { trips: 1, days: 4 })).toBe(false)
    expect(wouldEmpty({ trips: 2, days: 0 }, { trips: 1, days: 0 })).toBe(false)
  })

  it('stops a copy with content from being wiped', () => {
    expect(wouldEmpty({ trips: 1, days: 5 }, { trips: 0, days: 0 })).toBe(true)
    expect(wouldEmpty({ trips: 1, days: 5 }, { trips: 1, days: 0 })).toBe(true)
  })
})

describe('parseEnv', () => {
  it('reads values the way Vite does', () => {
    const text = '# comment\nVITE_A=one\nexport VITE_B = "two"\r\nVITE_A=three\nnot a line\nVITE_C=\'four\'\n'
    expect(parseEnv(text)).toEqual({ VITE_A: 'three', VITE_B: 'two', VITE_C: 'four' })
  })
})
