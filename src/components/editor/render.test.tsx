import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store } from '../../lib/store'
import type { Day, Photo, Trip } from '../../lib/types'
import ActionBar from './ActionBar'
import { backupKey } from './backup'
import BlockList from './BlockList'
import type { DraftBlock } from './blocks'
import DayEditor from './DayEditor'
import type { PendingUpload, Status } from './reducer'
import type { BlockActions } from './useDayEditor'

// These render to a string, without a browser: enough to check what each state
// of the editor shows and which controls it offers, though not how they behave.

const YOUTUBE = 'https://youtu.be/aqz-KE-bpKQ'

const trip: Trip = { id: 'trip-1', slug: 'india-nepal', title: 'India & Nepal', startDate: '2026-10-07', endDate: '2026-11-12', cover: null }

const photo = (name: string, caption?: string): Photo => ({
  path: `trip-1/2026-10-08/${name}.jpg`,
  thumbPath: `trip-1/2026-10-08/${name}_thumb.jpg`,
  width: 1600,
  height: 1200,
  ...(caption ? { caption } : {}),
})

const day: Day = {
  tripId: 'trip-1',
  date: '2026-10-08',
  location: 'Agra',
  published: true,
  updatedAt: '2026-10-08T18:00:00Z',
  blocks: [
    { id: 'words', type: 'text', text: 'Up before dawn.' },
    { id: 'pics', type: 'photos', photos: [photo('one', 'First light'), photo('two')] },
    { id: 'clip', type: 'video', source: 'upload', path: 'trip-1/2026-10-08/clip.mp4', caption: 'The river' },
    { id: 'link', type: 'video', source: 'embed', url: YOUTUBE },
  ],
}

// Apostrophes are un-escaped again so that the checks below can quote the copy as written.
const html = (element: ReactElement) => renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>).replaceAll('&#x27;', "'")

/** The opening tag of the button with this label, or null if there is no such button. */
function button(markup: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`<button([^>]*)>(?:<svg.*?</svg>)?${escaped}</button>`).exec(markup)
  return match ? match[1] : null
}

const isDisabled = (markup: string, label: string) => {
  const attributes = button(markup, label)
  if (attributes === null) throw new Error(`No "${label}" button in the markup.`)
  return attributes.includes('disabled=""')
}

function fakeStorage(items: Record<string, string>) {
  const map = new Map(Object.entries(items))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

const upload = (fields: Partial<PendingUpload> & Pick<PendingUpload, 'id' | 'blockId'>): PendingUpload => ({
  order: 0,
  kind: 'photo',
  name: 'IMG_0042.jpg',
  size: 2_000_000,
  previewUrl: 'blob:preview',
  status: 'uploading',
  progress: 0,
  error: '',
  ...fields,
})

const actions = new Proxy({}, { get: () => () => undefined }) as BlockActions

beforeEach(() => {
  vi.spyOn(store, 'mediaUrl').mockImplementation((path) => `https://media.test/${path}`)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('a day that has not been written yet', () => {
  const render = () => html(<DayEditor trip={trip} date="2026-10-14" day={null} />)

  it('shows the day, an empty location, and the three ways to start', () => {
    const markup = render()
    expect(markup).toContain('Day 8 · Wednesday')
    expect(markup).toContain('October 14')
    expect(markup).toContain('Not saved yet')
    expect(markup).toContain('placeholder="Where were you?"')
    expect(markup).toContain('Start with a few words, some photos, or a video.')
    for (const label of ['Add text', 'Add photos', 'Add video']) expect(button(markup, label), label).not.toBeNull()
  })

  it('opens the photo picker for several images at once', () => {
    expect(render()).toMatch(/<input[^>]*type="file"[^>]*accept="image\/\*"[^>]*multiple=""/)
  })

  it('offers Save draft and Publish, with nothing to save yet', () => {
    const markup = render()
    expect(markup).toContain('Nothing to save yet')
    expect(isDisabled(markup, 'Save draft')).toBe(true)
    expect(isDisabled(markup, 'Publish')).toBe(false)
    expect(button(markup, 'Update')).toBeNull()
    expect(button(markup, 'Delete day')).toBeNull()
    expect(markup).not.toContain('View on site')
  })

  it('links to the days either side', () => {
    const markup = render()
    expect(markup).toContain('href="/admin/trips/trip-1/days/2026-10-13"')
    expect(markup).toContain('aria-label="Previous day, October 13"')
    expect(markup).toContain('href="/admin/trips/trip-1/days/2026-10-15"')
    expect(markup).toContain('aria-label="Next day, October 15"')
  })

  it('stops at the ends of the trip', () => {
    const first = html(<DayEditor trip={trip} date="2026-10-07" day={null} />)
    expect(first).toContain('Day 1 · Wednesday')
    expect(first).not.toContain('Previous day')
    expect(first).toContain('Next day, October 8')

    const last = html(<DayEditor trip={trip} date="2026-11-12" day={null} />)
    expect(last).toContain('Day 37 · Thursday')
    expect(last).toContain('Previous day, November 11')
    expect(last).not.toContain('Next day')
  })

  it('still opens a date outside the trip, without a day number', () => {
    const markup = html(<DayEditor trip={trip} date="2027-01-01" day={null} />)
    expect(markup).toContain('January 1')
    expect(markup).not.toMatch(/Day -?\d+ ·/)
    expect(markup).toContain('Outside this trip')
    expect(markup).not.toContain('Previous day')
  })
})

describe('a published day', () => {
  const render = () => html(<DayEditor trip={trip} date="2026-10-08" day={day} />)

  it('shows every block with its content', () => {
    const markup = render()
    expect(markup).toContain('value="Agra"')
    expect(markup).toMatch(/<textarea[^>]*>Up before dawn\.<\/textarea>/)
    expect(markup).toContain('src="https://media.test/trip-1/2026-10-08/one_thumb.jpg"')
    expect(markup).toContain('value="First light"')
    expect(markup).toMatch(/<video[^>]*src="https:\/\/media\.test\/trip-1\/2026-10-08\/clip\.mp4"/)
    expect(markup).toMatch(/<video[^>]*controls=""[^>]*playsInline=""[^>]*preload="metadata"/i)
    expect(markup).toContain('value="The river"')
    expect(markup).toContain('src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"')
    expect(markup).toContain(`value="${YOUTUBE}"`)
  })

  it('labels each block and its controls, and disables moves at the ends', () => {
    const markup = render()
    expect(markup).toContain('aria-label="Text, block 1 of 4"')
    expect(markup).toContain('aria-label="Video, block 4 of 4"')
    expect(markup).toMatch(/<button[^>]*aria-label="Move text up"[^>]*disabled=""/)
    expect(markup).not.toMatch(/<button[^>]*aria-label="Move text down"[^>]*disabled=""/)
    expect(markup).toMatch(/<button[^>]*aria-label="Move video down"[^>]*disabled=""/)
    expect(markup).toContain('aria-label="Delete photos"')
    expect(markup).toMatch(/<button[^>]*aria-label="Move photo 1 earlier"[^>]*disabled=""/)
    expect(markup).toMatch(/<button[^>]*aria-label="Move photo 2 later"[^>]*disabled=""/)
    expect(markup).toContain('aria-label="Caption for photo 2"')
    expect(markup.match(/aria-label="Add a block here"/g)).toHaveLength(4)
  })

  it('states the clip size limit and hides the tab switch while a clip is in place', () => {
    const markup = render()
    expect(markup).toContain('Clips can be up to 50 MB.')
    // Only the link block still has "Upload a clip | Paste a link" to choose between.
    expect(markup.match(/Upload a clip/g)).toHaveLength(1)
    expect(button(markup, 'Replace')).not.toBeNull()
  })

  it('offers Update and Unpublish, and a link to the public page', () => {
    const markup = render()
    expect(markup).toContain('All changes saved')
    expect(markup).toContain('chip chip-published')
    expect(isDisabled(markup, 'Update')).toBe(true)
    expect(isDisabled(markup, 'Unpublish')).toBe(false)
    expect(button(markup, 'Publish')).toBeNull()
    expect(markup).toMatch(/<a[^>]*href="\/india-nepal\/2026-10-08"[^>]*>View on site<\/a>/)
    expect(button(markup, 'Delete day')).not.toBeNull()
  })

  it('does not link to the public page for a draft', () => {
    const markup = html(<DayEditor trip={trip} date="2026-10-08" day={{ ...day, published: false }} />)
    expect(markup).toContain('chip chip-draft')
    expect(markup).not.toContain('View on site')
    expect(button(markup, 'Save draft')).not.toBeNull()
  })
})

describe('unsaved changes left on the device', () => {
  const key = backupKey('trip-1', '2026-10-08')
  // Long ago, so that it is never "today", whenever the tests run.
  const editedAt = new Date(2020, 0, 2, 15, 42).getTime()
  const backup = (blocks: unknown, location = 'Agra') => JSON.stringify({ location, blocks, editedAt })

  it('offers them back and holds everything else until the owner decides', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [key]: backup([{ id: 'words', type: 'text', text: 'Up before dawn, and then' }]) }))
    const markup = html(<DayEditor trip={trip} date="2026-10-08" day={day} />)
    expect(markup).toMatch(/You have unsaved changes from Jan 2, 3:42\sPM on this device\./)
    expect(button(markup, 'Restore')).not.toBeNull()
    expect(button(markup, 'Discard')).not.toBeNull()
    expect(markup).toMatch(/<div[^>]*inert=""/)
    expect(markup).toContain('Restore or discard the changes above to carry on.')
    expect(isDisabled(markup, 'Unpublish')).toBe(true)
    // What is underneath is still the server's version.
    expect(markup).toMatch(/<textarea[^>]*>Up before dawn\.<\/textarea>/)
    expect(markup).not.toContain('View on site')
  })

  it('says nothing when the backup matches what the server has', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [key]: backup(day.blocks) }))
    const markup = html(<DayEditor trip={trip} date="2026-10-08" day={day} />)
    expect(markup).not.toContain('unsaved changes from')
    expect(markup).not.toContain('inert')
  })

  it('offers a backup for a day the server has never seen', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [backupKey('trip-1', '2026-10-14')]: backup([], 'Varanasi') }))
    expect(html(<DayEditor trip={trip} date="2026-10-14" day={null} />)).toContain('You have unsaved changes from')
  })

  it('opens normally when the backup is damaged or storage is blocked', () => {
    vi.stubGlobal('localStorage', fakeStorage({ [key]: '{"blocks": [' }))
    expect(html(<DayEditor trip={trip} date="2026-10-08" day={day} />)).toContain('All changes saved')

    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked')
      },
    })
    expect(html(<DayEditor trip={trip} date="2026-10-08" day={day} />)).toContain('All changes saved')
  })
})

describe('blocks with uploads', () => {
  const photos: DraftBlock = { id: 'pics', type: 'photos', photos: [photo('one')] }
  const video: DraftBlock = { id: 'clip', type: 'video', source: 'upload', path: '', url: '', caption: '' }
  const render = (blocks: DraftBlock[], uploads: PendingUpload[]) => html(<BlockList blocks={blocks} uploads={uploads} actions={actions} />)

  it('shows a waiting and an uploading photo with their previews', () => {
    const markup = render(
      [photos],
      [upload({ id: 'u1', blockId: 'pics' }), upload({ id: 'u2', blockId: 'pics', status: 'queued', name: 'IMG_0043.jpg' })],
    )
    expect(markup.match(/src="blob:preview"/g)).toHaveLength(2)
    expect(markup.match(/class="spinner"/g)).toHaveLength(2)
    expect(markup).toContain('Uploading…')
    expect(markup).toContain('Waiting to upload…')
    expect(markup).toContain('aria-label="Cancel uploading IMG_0043.jpg"')
  })

  it('shows why a photo failed, with Retry and Remove', () => {
    const markup = render([photos], [upload({ id: 'u1', blockId: 'pics', status: 'failed', error: 'You appear to be offline.' })])
    expect(markup).toContain('You appear to be offline.')
    expect(button(markup, 'Retry')).not.toBeNull()
    expect(markup).not.toContain('class="spinner"')
    // One Remove for the stored photo, one for the failed upload.
    expect(markup.match(/>Remove<\/button>/g)).toHaveLength(2)
  })

  it('shows a clip uploading, with its percentage and a way to cancel', () => {
    const markup = render([video], [upload({ id: 'u1', blockId: 'clip', kind: 'video', name: 'ghats.mov', previewUrl: '', progress: 0.42 })])
    expect(markup).toMatch(/role="progressbar"[^>]*aria-valuenow="42"/)
    expect(markup).toContain('<span style="width:42%"></span>')
    expect(markup).toContain('42%')
    expect(button(markup, 'Cancel')).not.toBeNull()
    expect(button(markup, 'Choose a clip')).toBeNull()
    // Switching to a link is held back while the clip is on its way.
    expect(markup.match(/<input[^>]*type="radio"[^>]*disabled=""/g)).toHaveLength(2)
  })

  it('points to the link tab when a clip is too large', () => {
    const error = '"ghats.mov" is 80 MB. Uploaded clips can be at most 50 MB; trim it, or put it on YouTube and paste the link instead.'
    const markup = render(
      [video],
      [upload({ id: 'u1', blockId: 'clip', kind: 'video', name: 'ghats.mov', previewUrl: '', size: 80 * 1024 * 1024, status: 'failed', error })],
    )
    expect(markup).toContain('Uploaded clips can be at most 50 MB')
    expect(button(markup, 'Paste a link instead')).not.toBeNull()
    expect(button(markup, 'Try again')).toBeNull()
    expect(button(markup, 'Choose another clip')).not.toBeNull()
  })

  it('offers to try again when a clip failed for another reason', () => {
    const markup = render(
      [video],
      [upload({ id: 'u1', blockId: 'clip', kind: 'video', name: 'ghats.mov', previewUrl: '', status: 'failed', error: 'The connection dropped.' })],
    )
    expect(markup).toContain('The connection dropped.')
    expect(button(markup, 'Try again')).not.toBeNull()
    expect(button(markup, 'Paste a link instead')).toBeNull()
  })

  it('checks a pasted link as it is typed', () => {
    const link = (url: string): DraftBlock => ({ id: 'link', type: 'video', source: 'embed', path: '', url, caption: '' })
    const invalid = render([link('https://example.com/video')], [])
    expect(invalid).toContain('Paste a YouTube or Vimeo link')
    expect(invalid).toContain('aria-invalid="true"')
    expect(invalid).not.toContain('<iframe')

    const empty = render([link('')], [])
    expect(empty).not.toContain('Paste a YouTube or Vimeo link')
    expect(empty).not.toContain('<iframe')

    const valid = render([link(` ${YOUTUBE} `)], [])
    expect(valid).not.toContain('Paste a YouTube or Vimeo link')
    expect(valid).toContain('<iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"')
  })

  it('does not break on a photo or clip whose file is gone', () => {
    vi.mocked(store.mediaUrl).mockReturnValue('')
    const markup = render([photos, { ...video, path: 'trip-1/2026-10-08/gone.mp4' } as DraftBlock], [])
    expect(markup).toContain("This photo's file didn't load.")
    expect(markup).toContain("This clip can't be played here.")
    expect(markup).not.toContain('<video')
    expect(markup).not.toContain('<img')
  })
})

describe('action bar', () => {
  const render = (props: { status?: Status; dirty?: boolean; uploading?: boolean; exists?: boolean; published?: boolean; locked?: boolean }) =>
    html(
      <ActionBar
        status={{ kind: 'idle' }}
        dirty={false}
        uploading={false}
        exists
        published={false}
        locked={false}
        onSave={() => {}}
        onRetry={() => {}}
        {...props}
      />,
    )

  it('says when there are unsaved changes and lets them be saved', () => {
    const markup = render({ dirty: true })
    expect(markup).toContain('Unsaved changes')
    expect(isDisabled(markup, 'Save draft')).toBe(false)
    expect(isDisabled(markup, 'Publish')).toBe(false)
  })

  it('holds saving while uploads are running, and says why', () => {
    const markup = render({ dirty: true, uploading: true })
    expect(markup).toContain('Wait for uploads to finish')
    expect(isDisabled(markup, 'Save draft')).toBe(true)
    expect(isDisabled(markup, 'Publish')).toBe(true)

    const published = render({ dirty: true, uploading: true, published: true })
    expect(isDisabled(published, 'Update')).toBe(true)
    expect(isDisabled(published, 'Unpublish')).toBe(true)
  })

  it('shows progress while saving', () => {
    const markup = render({ dirty: true, status: { kind: 'saving' } })
    expect(markup).toContain('Saving…')
    expect(markup).toContain('spinner')
    expect(isDisabled(markup, 'Publish')).toBe(true)
  })

  it('shows why a save failed and offers to retry', () => {
    const status: Status = { kind: 'failed', message: 'You appear to be offline.', retry: { action: 'save', published: true } }
    const markup = render({ dirty: true, status })
    expect(markup).toContain('Not saved. You appear to be offline.')
    expect(markup).toContain('aria-live="assertive"')
    expect(isDisabled(markup, 'Retry')).toBe(false)
    expect(isDisabled(markup, 'Save draft')).toBe(false)
  })

  it('announces its status politely otherwise', () => {
    expect(render({})).toMatch(/role="status"[^>]*aria-live="polite"/)
  })
})
