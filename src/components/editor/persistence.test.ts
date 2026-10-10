import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Day, DayInput, Photo } from '../../lib/types'
import { collectPaths, differsFromSaved, type DraftBlock } from './blocks'
import { createPersistence } from './persistence'
import { editorReducer, initialState, type EditorAction, type EditorState, type PendingUpload } from './reducer'

const photo = (name: string): Photo => ({ path: `${name}.jpg`, thumbPath: `${name}_thumb.jpg`, width: 1600, height: 1200 })
const pathsOf = (...names: string[]) => names.flatMap((name) => [`${name}.jpg`, `${name}_thumb.jpg`])

const day: Day = {
  tripId: 'trip',
  date: '2026-10-14',
  location: 'Varanasi',
  published: false,
  updatedAt: '2026-10-14T18:00:00Z',
  blocks: [
    { id: 'text', type: 'text', text: 'Hello' },
    { id: 'photos', type: 'photos', photos: [photo('a'), photo('b')] },
  ],
}

const pending = (id: string, blockId: string): PendingUpload => ({
  id,
  blockId,
  order: 0,
  kind: 'photo',
  name: `${id}.jpg`,
  size: 1000,
  previewUrl: '',
  status: 'uploading',
  progress: 0,
  error: '',
})

/** Lets every pending promise callback run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * The persistence layer wired to the real reducer, with a store that records
 * what it is asked to do and can be told to stall or fail.
 */
function setup(initial: Day | null = day) {
  let state: EditorState = initialState(initial)
  const dispatch = (action: EditorAction) => {
    state = editorReducer(state, action)
  }

  const saves: DayInput[] = []
  const deletedMedia: string[][] = []
  let deletedDay = false
  let idle = 0
  let failSave: Error | null = null
  let failMedia: Error | null = null
  let failDelete: Error | null = null
  let gate: Promise<void> | null = null
  let openGate = () => {}

  const persistence = createPersistence({
    tripId: 'trip',
    date: '2026-10-14',
    backend: {
      async saveDay(input) {
        saves.push(structuredClone(input))
        if (gate) await gate
        if (failSave) throw failSave
        return { ...structuredClone(input), updatedAt: '2026-10-14T19:00:00Z' }
      },
      async deleteDay() {
        if (gate) await gate
        if (failDelete) throw failDelete
        deletedDay = true
      },
      async deleteMedia(paths) {
        if (failMedia) throw failMedia
        deletedMedia.push([...paths].sort())
      },
    },
    getState: () => state,
    dispatch,
    onIdle: () => void idle++,
  })

  return {
    persistence,
    dispatch,
    saves,
    deletedMedia,
    get state() {
      return state
    },
    get dirty() {
      return differsFromSaved(state.location, state.blocks, state.saved)
    },
    get deletedDay() {
      return deletedDay
    },
    get idle() {
      return idle
    },
    /** Makes the next store call wait until `release()` is called. */
    stall() {
      gate = new Promise<void>((resolve) => {
        openGate = resolve
      })
    },
    release() {
      openGate()
      gate = null
    },
    failSaves: (error: Error | null) => void (failSave = error),
    failMediaDeletes: (error: Error | null) => void (failMedia = error),
    failDayDelete: (error: Error | null) => void (failDelete = error),
    /** A photo uploaded during this visit and added to a block. */
    addUploaded(blockId: string, name: string) {
      persistence.own(pathsOf(name))
      dispatch({ type: 'uploadQueued', upload: pending(`upload-${name}`, blockId) })
      dispatch({ type: 'photoUploaded', id: `upload-${name}`, photo: photo(name) })
    },
  }
}

describe('saving', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the tidied draft and records it as saved', async () => {
    const t = setup()
    t.dispatch({ type: 'locationChanged', location: '  Sarnath ' })
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Hello again\n\n' })
    t.dispatch({ type: 'blockInserted', block: { id: 'blank', type: 'text', text: '   ' }, beforeId: null })
    t.dispatch({ type: 'photoCaptionChanged', blockId: 'photos', path: 'a.jpg', caption: ' Dawn ' })
    expect(t.dirty).toBe(true)

    await t.persistence.save(true)

    expect(t.saves).toEqual([
      {
        tripId: 'trip',
        date: '2026-10-14',
        location: 'Sarnath',
        published: true,
        blocks: [
          { id: 'text', type: 'text', text: 'Hello again' },
          { id: 'photos', type: 'photos', photos: [{ ...photo('a'), caption: 'Dawn' }, photo('b')] },
        ],
      },
    ])
    expect(t.state.status).toEqual({ kind: 'idle' })
    expect(t.state.published).toBe(true)
    expect(t.dirty).toBe(false)
    expect(t.idle).toBe(1)
  })

  it('leaves what is on screen untouched, including what saving would tidy away', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Hello again\n\n' })
    t.dispatch({ type: 'blockInserted', block: { id: 'blank', type: 'text', text: '' }, beforeId: null })
    const before = t.state.blocks
    await t.persistence.save(false)
    expect(t.state.blocks).toBe(before)
  })

  it('shows "saving" while the request is on its way', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.stall()
    const saving = t.persistence.save(false)
    expect(t.state.status).toEqual({ kind: 'saving' })
    expect(t.persistence.isBusy()).toBe(true)
    t.release()
    await saving
    expect(t.state.status).toEqual({ kind: 'idle' })
    expect(t.persistence.isBusy()).toBe(false)
  })

  it('keeps everything exactly as it was when the save fails, and can be retried', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Written offline' })
    t.addUploaded('photos', 'c')
    const { blocks, location, saved } = t.state

    t.failSaves(new Error('You appear to be offline.'))
    await t.persistence.save(true)

    expect(t.state.status).toEqual({ kind: 'failed', message: 'You appear to be offline.', retry: { action: 'save', published: true } })
    expect(t.state.blocks).toBe(blocks)
    expect(t.state.location).toBe(location)
    expect(t.state.saved).toBe(saved)
    expect(t.state.published).toBe(false)
    expect(t.dirty).toBe(true)
    expect(t.deletedMedia).toEqual([])
    expect(t.persistence.isBusy()).toBe(false)
    expect(t.idle).toBe(1)

    t.failSaves(null)
    await t.persistence.save(true)
    expect(t.state.status).toEqual({ kind: 'idle' })
    expect(t.dirty).toBe(false)
    expect(t.saves).toHaveLength(2)
    expect(t.saves[1]).toEqual(t.saves[0])
  })

  it('does not save while uploads are running', async () => {
    const t = setup()
    t.dispatch({ type: 'uploadQueued', upload: pending('u1', 'photos') })
    await t.persistence.save(false)
    expect(t.saves).toEqual([])
    expect(t.state.status).toEqual({ kind: 'idle' })
  })

  it('saves despite an upload that has failed and is only waiting to be retried', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.dispatch({ type: 'uploadQueued', upload: pending('u1', 'photos') })
    t.dispatch({ type: 'uploadFailed', id: 'u1', error: 'offline' })
    await t.persistence.save(false)
    expect(t.saves).toHaveLength(1)
    // The failed upload is still there to retry afterwards.
    expect(t.state.uploads).toHaveLength(1)
  })

  it('ignores a second save while the first is still running', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.stall()
    const first = t.persistence.save(false)
    await t.persistence.save(true)
    expect(t.saves).toHaveLength(1)
    t.release()
    await first
    expect(t.state.published).toBe(false)
  })

  it('counts edits made during a save as unsaved', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'First' })
    t.stall()
    const saving = t.persistence.save(false)
    t.dispatch({ type: 'textChanged', id: 'text', text: 'First, and more' })
    t.release()
    await saving
    expect(t.saves[0].blocks[0]).toEqual({ id: 'text', type: 'text', text: 'First' })
    expect(t.state.status).toEqual({ kind: 'idle' })
    expect(t.dirty).toBe(true)
  })

  it('creates a day that did not exist', async () => {
    const t = setup(null)
    t.dispatch({ type: 'blockInserted', block: { id: 'new', type: 'text', text: 'Day one' }, beforeId: null })
    await t.persistence.save(false)
    expect(t.state.saved).toEqual({ location: '', blocks: [{ id: 'new', type: 'text', text: 'Day one' }] })
    expect(t.dirty).toBe(false)
    expect(t.deletedMedia).toEqual([])
  })
})

describe('tidying stored media after a save', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('deletes nothing when nothing was dropped', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.addUploaded('photos', 'c')
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([])
  })

  it('deletes a saved photo that was removed, full image and thumbnail', async () => {
    const t = setup()
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'b.jpg' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([pathsOf('b')])
  })

  it('deletes uploads from this visit that the saved day does not use, and keeps the ones it does', async () => {
    const t = setup()
    t.addUploaded('photos', 'c')
    t.addUploaded('photos', 'd')
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'd.jpg' })
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'a.jpg' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([[...pathsOf('a'), ...pathsOf('d')].sort()])
    expect(collectPaths(t.state.saved?.blocks ?? []).sort()).toEqual([...pathsOf('b'), ...pathsOf('c')].sort())
  })

  it('deletes the media of a deleted block and a replaced clip', async () => {
    const t = setup({
      ...day,
      blocks: [...day.blocks, { id: 'video', type: 'video', source: 'upload', path: 'old.mp4' }],
    })
    t.dispatch({ type: 'blockRemoved', id: 'photos' })
    t.persistence.own(['new.mp4'])
    t.dispatch({ type: 'uploadQueued', upload: { ...pending('u1', 'video'), kind: 'video' } })
    t.dispatch({ type: 'videoUploaded', id: 'u1', path: 'new.mp4' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([[...pathsOf('a', 'b'), 'old.mp4'].sort()])
  })

  it('deletes a clip that was swapped for a link', async () => {
    const t = setup({ ...day, blocks: [{ id: 'video', type: 'video', source: 'upload', path: 'old.mp4' }] })
    t.dispatch({ type: 'videoCleared', id: 'video' })
    t.dispatch({ type: 'videoChanged', id: 'video', change: { source: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' } })
    await t.persistence.save(false)
    await settle()
    expect(t.saves[0].blocks).toEqual([{ id: 'video', type: 'video', source: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' }])
    expect(t.deletedMedia).toEqual([['old.mp4']])
  })

  it('does not fail the save when the clean-up fails, and tries again after the next save', async () => {
    const t = setup()
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'b.jpg' })
    t.failMediaDeletes(new Error('Storage is unreachable.'))
    await t.persistence.save(false)
    await settle()

    expect(t.state.status).toEqual({ kind: 'idle' })
    expect(t.dirty).toBe(false)
    expect(t.deletedMedia).toEqual([])
    expect(console.error).toHaveBeenCalled()

    t.failMediaDeletes(null)
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Another edit' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([pathsOf('b')])

    // And once it has worked, it is not asked for again.
    t.dispatch({ type: 'textChanged', id: 'text', text: 'A third edit' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toHaveLength(1)
  })

  it('never deletes a file that is still on screen, even if the save that just finished did not include it', async () => {
    const t = setup()
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'b.jpg' })
    t.persistence.own(pathsOf('late'))
    t.stall()
    const saving = t.persistence.save(false)
    // Something still in the draft that the request already on its way knows nothing about.
    t.dispatch({ type: 'restored', location: 'Varanasi', blocks: [{ id: 'photos', type: 'photos', photos: [photo('a'), photo('late')] }] })
    t.release()
    await saving
    await settle()
    expect(t.deletedMedia).toEqual([pathsOf('b')])
  })

  it('keeps a photo that was removed during a save, because that save still refers to it', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.stall()
    const saving = t.persistence.save(false)
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'b.jpg' })
    t.release()
    await saving
    await settle()
    expect(t.deletedMedia).toEqual([])
    expect(t.dirty).toBe(true)

    // The next save no longer includes it, so now it goes.
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([pathsOf('b')])
  })

  it('stops being answerable for files that were deleted elsewhere', async () => {
    const t = setup()
    t.persistence.own(pathsOf('orphan'))
    t.persistence.disown(pathsOf('orphan'))
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    await t.persistence.save(false)
    await settle()
    expect(t.deletedMedia).toEqual([])
  })
})

describe('leaving, discarding, and deleting', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clears out uploads that were dropped again when the editor closes without a save', async () => {
    const t = setup()
    t.addUploaded('photos', 'kept')
    t.addUploaded('photos', 'dropped')
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'dropped.jpg' })
    t.persistence.leave()
    await settle()
    // "kept" is unsaved but still in the draft, which the local backup can bring back.
    expect(t.deletedMedia).toEqual([pathsOf('dropped')])
  })

  it('leaves saved media alone on the way out, even when the draft no longer uses it', async () => {
    const t = setup()
    t.dispatch({ type: 'blockRemoved', id: 'photos' })
    t.persistence.leave()
    await settle()
    expect(t.deletedMedia).toEqual([])
  })

  it('touches nothing on the way out while a save is still in flight', async () => {
    const t = setup()
    t.addUploaded('photos', 'c')
    t.stall()
    const saving = t.persistence.save(false)
    t.dispatch({ type: 'photoRemoved', blockId: 'photos', path: 'c.jpg' })
    t.persistence.leave()
    await settle()
    expect(t.deletedMedia).toEqual([])
    t.release()
    await saving
    await settle()
    // The save that was in flight included the photo, so it stays.
    expect(t.deletedMedia).toEqual([])
  })

  it('deletes only what a discarded backup alone referred to', async () => {
    const t = setup()
    const backupBlocks: DraftBlock[] = [{ id: 'photos', type: 'photos', photos: [photo('a'), photo('unsaved')] }]
    await t.persistence.deleteUnused(collectPaths(backupBlocks), t.state.saved)
    expect(t.deletedMedia).toEqual([pathsOf('unsaved')])
  })

  it('never rejects, whatever the store does', async () => {
    const t = setup()
    t.failMediaDeletes(new Error('Storage is unreachable.'))
    await expect(t.persistence.deleteUnused(['x.jpg'], null)).resolves.toBeUndefined()
  })

  it('deletes the day', async () => {
    const t = setup()
    t.stall()
    const deleting = t.persistence.deleteDay()
    expect(t.state.status).toEqual({ kind: 'deleting' })
    t.release()
    expect(await deleting).toBe(true)
    expect(t.deletedDay).toBe(true)
    // Still busy: the editor is closing, and nothing else should start.
    expect(t.persistence.isBusy()).toBe(true)
    t.persistence.leave()
    await settle()
    expect(t.deletedMedia).toEqual([])
  })

  it('reports a failed delete and lets it be tried again', async () => {
    const t = setup()
    t.failDayDelete(new Error('You appear to be offline.'))
    expect(await t.persistence.deleteDay()).toBe(false)
    expect(t.state.status).toEqual({ kind: 'failed', message: 'You appear to be offline.', retry: { action: 'delete' } })
    expect(t.persistence.isBusy()).toBe(false)
    expect(t.idle).toBe(1)

    t.failDayDelete(null)
    expect(await t.persistence.deleteDay()).toBe(true)
  })

  it('does not delete while a save is running', async () => {
    const t = setup()
    t.dispatch({ type: 'textChanged', id: 'text', text: 'Edited' })
    t.stall()
    const saving = t.persistence.save(false)
    expect(await t.persistence.deleteDay()).toBe(false)
    expect(t.state.status).toEqual({ kind: 'saving' })
    t.release()
    await saving
    expect(t.deletedDay).toBe(false)
  })
})
