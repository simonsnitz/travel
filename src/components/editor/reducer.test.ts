import { describe, expect, it } from 'vitest'
import type { Day, Photo } from '../../lib/types'
import { differsFromSaved, type DraftBlock, type VideoDraft } from './blocks'
import { editorReducer, initialState, isUploading, type EditorAction, type EditorState, type PendingUpload } from './reducer'

const YOUTUBE = 'https://youtu.be/aqz-KE-bpKQ'

const photo = (name: string): Photo => ({ path: `${name}.jpg`, thumbPath: `${name}_thumb.jpg`, width: 1600, height: 1200 })

const upload = (id: string, blockId: string, kind: PendingUpload['kind'] = 'photo', order = 0): PendingUpload => ({
  id,
  blockId,
  order,
  kind,
  name: `${id}.${kind === 'photo' ? 'jpg' : 'mp4'}`,
  size: 1000,
  previewUrl: kind === 'photo' ? `blob:${id}` : '',
  status: 'queued',
  progress: 0,
  error: '',
})

const emptyPhotos = (id: string): DraftBlock => ({ id, type: 'photos', photos: [] })
const emptyVideo = (id: string): VideoDraft => ({ id, type: 'video', source: 'upload', path: '', url: '', caption: '' })

const day: Day = {
  tripId: 'trip',
  date: '2026-10-14',
  location: 'Varanasi',
  published: true,
  updatedAt: '2026-10-14T18:00:00Z',
  blocks: [
    { id: 'text', type: 'text', text: 'Hello' },
    { id: 'photos', type: 'photos', photos: [photo('one'), photo('two')] },
    { id: 'video', type: 'video', source: 'embed', url: YOUTUBE },
  ],
}

const run = (state: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, state)
const ids = (state: EditorState) => state.blocks.map((block) => block.id)
const photosOf = (state: EditorState, id: string) => {
  const block = state.blocks.find((candidate) => candidate.id === id)
  return block?.type === 'photos' ? block.photos.map((item) => item.path) : null
}
const videoOf = (state: EditorState, id: string) => state.blocks.find((block) => block.id === id) as VideoDraft

describe('initialState', () => {
  it('starts a new day empty and unsaved', () => {
    expect(initialState(null)).toEqual({
      location: '',
      blocks: [],
      uploads: [],
      arrivals: {},
      saved: null,
      published: false,
      status: { kind: 'idle' },
    })
  })

  it('loads a saved day without counting it as changed', () => {
    const state = initialState(day)
    expect(state.location).toBe('Varanasi')
    expect(ids(state)).toEqual(['text', 'photos', 'video'])
    expect(state.published).toBe(true)
    expect(differsFromSaved(state.location, state.blocks, state.saved)).toBe(false)
  })

  it('does not count a day as changed because the server held something unusable', () => {
    const odd = { ...day, blocks: [...day.blocks, { id: 'x', type: 'photos', photos: [] }, { id: 'y', type: 'text', text: '  ' }] } as Day
    const state = initialState(odd)
    expect(differsFromSaved(state.location, state.blocks, state.saved)).toBe(false)
  })
})

describe('editing blocks', () => {
  const state = initialState(day)

  it('inserts by id, moves, and removes', () => {
    const next = run(state, { type: 'blockInserted', block: { id: 'new', type: 'text', text: '' }, beforeId: 'photos' })
    expect(ids(next)).toEqual(['text', 'new', 'photos', 'video'])
    expect(ids(run(next, { type: 'blockMoved', id: 'new', delta: 1 }))).toEqual(['text', 'photos', 'new', 'video'])
    expect(ids(run(next, { type: 'blockRemoved', id: 'photos' }))).toEqual(['text', 'new', 'video'])
    // Inserting the same block twice (a double tap) adds it once.
    expect(run(next, { type: 'blockInserted', block: { id: 'new', type: 'text', text: '' }, beforeId: null })).toBe(next)
  })

  it('returns the same state when a move changes nothing', () => {
    expect(run(state, { type: 'blockMoved', id: 'text', delta: -1 })).toBe(state)
    expect(run(state, { type: 'blockMoved', id: 'gone', delta: 1 })).toBe(state)
  })

  it('edits text, captions, and photo order', () => {
    const next = run(
      state,
      { type: 'textChanged', id: 'text', text: 'Hello again' },
      { type: 'photoCaptionChanged', blockId: 'photos', path: 'two.jpg', caption: 'Dusk' },
      { type: 'photoMoved', blockId: 'photos', path: 'two.jpg', delta: -1 },
    )
    expect(next.blocks[0]).toEqual({ id: 'text', type: 'text', text: 'Hello again' })
    expect(next.blocks[1]).toEqual({ id: 'photos', type: 'photos', photos: [{ ...photo('two'), caption: 'Dusk' }, photo('one')] })

    const cleared = run(next, { type: 'photoCaptionChanged', blockId: 'photos', path: 'two.jpg', caption: '' })
    expect(cleared.blocks[1]).toEqual({ id: 'photos', type: 'photos', photos: [photo('two'), photo('one')] })
  })

  it('ignores edits aimed at the wrong kind of block', () => {
    expect(run(state, { type: 'textChanged', id: 'photos', text: 'x' })).toBe(state)
    expect(run(state, { type: 'photoRemoved', blockId: 'text', path: 'one.jpg' })).toBe(state)
    expect(run(state, { type: 'videoChanged', id: 'text', change: { url: 'x' } })).toBe(state)
  })

  it('removes a photos block along with its last photo', () => {
    const one = run(state, { type: 'photoRemoved', blockId: 'photos', path: 'one.jpg' })
    expect(photosOf(one, 'photos')).toEqual(['two.jpg'])
    const none = run(one, { type: 'photoRemoved', blockId: 'photos', path: 'two.jpg' })
    expect(ids(none)).toEqual(['text', 'video'])
  })

  it('keeps a photos block whose last photo is removed while more are uploading', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'photos') },
      { type: 'photoRemoved', blockId: 'photos', path: 'one.jpg' },
      { type: 'photoRemoved', blockId: 'photos', path: 'two.jpg' },
    )
    expect(photosOf(next, 'photos')).toEqual([])
  })
})

describe('video blocks', () => {
  const state = run(initialState(null), { type: 'blockInserted', block: emptyVideo('v'), beforeId: null })

  it('switches tabs and keeps the link while the upload tab is showing', () => {
    const next = run(
      state,
      { type: 'videoChanged', id: 'v', change: { source: 'embed' } },
      { type: 'videoChanged', id: 'v', change: { url: YOUTUBE } },
      { type: 'videoChanged', id: 'v', change: { source: 'upload' } },
    )
    expect(videoOf(next, 'v')).toMatchObject({ source: 'upload', url: YOUTUBE, path: '' })
  })

  it('stores an uploaded clip, drops the link it replaces, and stays on the upload tab', () => {
    const next = run(
      state,
      { type: 'videoChanged', id: 'v', change: { url: YOUTUBE, caption: 'Rickshaw' } },
      { type: 'uploadQueued', upload: upload('u1', 'v', 'video') },
      { type: 'videoUploaded', id: 'u1', path: 'clip.mp4' },
    )
    expect(videoOf(next, 'v')).toEqual({ id: 'v', type: 'video', source: 'upload', path: 'clip.mp4', url: '', caption: 'Rickshaw' })
    expect(next.uploads).toEqual([])

    const stillUpload = run(next, { type: 'videoChanged', id: 'v', change: { source: 'embed' } })
    expect(videoOf(stillUpload, 'v').source).toBe('upload')

    const cleared = run(next, { type: 'videoCleared', id: 'v' }, { type: 'videoChanged', id: 'v', change: { source: 'embed' } })
    expect(videoOf(cleared, 'v')).toMatchObject({ source: 'embed', path: '' })
  })

  it('keeps one pending upload per video block', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'v', 'video') },
      { type: 'uploadFailed', id: 'u1', error: 'Too large' },
      { type: 'uploadQueued', upload: upload('u2', 'v', 'video') },
    )
    expect(next.uploads.map((item) => item.id)).toEqual(['u2'])
  })
})

describe('uploads', () => {
  const state = run(initialState(day), { type: 'blockInserted', block: emptyPhotos('fresh'), beforeId: null })

  it('tracks an upload from queued to stored', () => {
    const queued = run(state, { type: 'uploadQueued', upload: upload('u1', 'fresh') })
    expect(queued.uploads).toEqual([upload('u1', 'fresh')])
    expect(isUploading(queued)).toBe(true)

    const started = run(queued, { type: 'uploadStarted', id: 'u1' })
    expect(started.uploads[0].status).toBe('uploading')

    const stored = run(started, { type: 'photoUploaded', id: 'u1', photo: photo('new') })
    expect(stored.uploads).toEqual([])
    expect(photosOf(stored, 'fresh')).toEqual(['new.jpg'])
    expect(isUploading(stored)).toBe(false)
  })

  it('adds each photo to its own block, wherever that block has moved to', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'fresh') },
      { type: 'uploadQueued', upload: upload('u2', 'photos') },
      { type: 'blockMoved', id: 'fresh', delta: -1 },
      { type: 'blockMoved', id: 'fresh', delta: -1 },
      { type: 'blockInserted', block: { id: 'top', type: 'text', text: '' }, beforeId: 'text' },
      { type: 'photoUploaded', id: 'u2', photo: photo('b') },
      { type: 'photoUploaded', id: 'u1', photo: photo('a') },
    )
    expect(ids(next)).toEqual(['top', 'text', 'fresh', 'photos', 'video'])
    expect(photosOf(next, 'fresh')).toEqual(['a.jpg'])
    expect(photosOf(next, 'photos')).toEqual(['one.jpg', 'two.jpg', 'b.jpg'])
  })

  it('puts photos in the order they were chosen, whatever order their uploads finish in', () => {
    const queued = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'photos', 'photo', 1) },
      { type: 'uploadQueued', upload: upload('u2', 'photos', 'photo', 2) },
      { type: 'uploadQueued', upload: upload('u3', 'photos', 'photo', 3) },
      { type: 'uploadQueued', upload: upload('u4', 'photos', 'photo', 4) },
    )
    const next = run(
      queued,
      { type: 'photoUploaded', id: 'u3', photo: photo('c') },
      { type: 'photoUploaded', id: 'u1', photo: photo('a') },
      { type: 'photoUploaded', id: 'u4', photo: photo('d') },
      { type: 'photoUploaded', id: 'u2', photo: photo('b') },
    )
    // After the photos that were already there, and in the order chosen.
    expect(photosOf(next, 'photos')).toEqual(['one.jpg', 'two.jpg', 'a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'])
  })

  it('keeps a retried photo in its place among the ones chosen with it', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'fresh', 'photo', 1) },
      { type: 'uploadQueued', upload: upload('u2', 'fresh', 'photo', 2) },
      { type: 'uploadFailed', id: 'u1', error: 'offline' },
      { type: 'photoUploaded', id: 'u2', photo: photo('b') },
      { type: 'uploadRetried', id: 'u1' },
      { type: 'photoUploaded', id: 'u1', photo: photo('a') },
    )
    expect(photosOf(next, 'fresh')).toEqual(['a.jpg', 'b.jpg'])
  })

  it('adds a later batch after an earlier one', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'fresh', 'photo', 1) },
      { type: 'photoUploaded', id: 'u1', photo: photo('a') },
      { type: 'uploadQueued', upload: upload('u2', 'fresh', 'photo', 2) },
      { type: 'uploadQueued', upload: upload('u3', 'fresh', 'photo', 3) },
      { type: 'photoUploaded', id: 'u3', photo: photo('c') },
      { type: 'photoUploaded', id: 'u2', photo: photo('b') },
    )
    expect(photosOf(next, 'fresh')).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('ignores a result for a block that was deleted meanwhile', () => {
    const removed = run(state, { type: 'uploadQueued', upload: upload('u1', 'fresh') }, { type: 'blockRemoved', id: 'fresh' })
    expect(removed.uploads).toEqual([])
    expect(run(removed, { type: 'photoUploaded', id: 'u1', photo: photo('late') })).toBe(removed)
    expect(run(removed, { type: 'uploadFailed', id: 'u1', error: 'offline' })).toBe(removed)
    expect(run(removed, { type: 'uploadProgress', id: 'u1', progress: 0.5 })).toBe(removed)
  })

  it('ignores a result for an upload that was removed meanwhile', () => {
    const dropped = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'photos') },
      { type: 'uploadStarted', id: 'u1' },
      { type: 'uploadDropped', id: 'u1' },
    )
    const late = run(dropped, { type: 'photoUploaded', id: 'u1', photo: photo('late') })
    expect(late).toBe(dropped)
    expect(photosOf(late, 'photos')).toEqual(['one.jpg', 'two.jpg'])
    expect(run(dropped, { type: 'videoUploaded', id: 'u1', path: 'late.mp4' })).toBe(dropped)
  })

  it('does not queue an upload for a missing block or the wrong kind of block', () => {
    expect(run(state, { type: 'uploadQueued', upload: upload('u1', 'gone') })).toBe(state)
    expect(run(state, { type: 'uploadQueued', upload: upload('u1', 'text') })).toBe(state)
    expect(run(state, { type: 'uploadQueued', upload: upload('u1', 'photos', 'video') })).toBe(state)
  })

  it('shows a failure, lets it be retried, and stops blocking saves meanwhile', () => {
    const failed = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'fresh') },
      { type: 'uploadStarted', id: 'u1' },
      { type: 'uploadFailed', id: 'u1', error: 'You are offline.' },
    )
    expect(failed.uploads[0]).toMatchObject({ status: 'failed', error: 'You are offline.' })
    expect(isUploading(failed)).toBe(false)

    const retried = run(failed, { type: 'uploadRetried', id: 'u1' })
    expect(retried.uploads[0]).toMatchObject({ status: 'queued', error: '' })
    expect(isUploading(retried)).toBe(true)
  })

  it('removes a photos block once its only upload is given up on', () => {
    const failed = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'fresh') },
      { type: 'uploadQueued', upload: upload('u2', 'fresh') },
      { type: 'uploadDropped', id: 'u1' },
    )
    expect(ids(failed)).toContain('fresh')
    expect(ids(run(failed, { type: 'uploadDropped', id: 'u2' }))).toEqual(['text', 'photos', 'video'])
  })

  it('keeps progress between 0 and 1, and only while uploading', () => {
    const queued = run(
      state,
      { type: 'blockInserted', block: emptyVideo('v'), beforeId: null },
      { type: 'uploadQueued', upload: upload('u1', 'v', 'video') },
    )
    expect(run(queued, { type: 'uploadProgress', id: 'u1', progress: 0.5 }).uploads[0].progress).toBe(0)
    const started = run(queued, { type: 'uploadStarted', id: 'u1' })
    expect(run(started, { type: 'uploadProgress', id: 'u1', progress: 0.5 }).uploads[0].progress).toBe(0.5)
    expect(run(started, { type: 'uploadProgress', id: 'u1', progress: 7 }).uploads[0].progress).toBe(1)
  })

  it('does not add the same stored photo twice', () => {
    const next = run(
      state,
      { type: 'uploadQueued', upload: upload('u1', 'photos') },
      { type: 'photoUploaded', id: 'u1', photo: photo('one') },
    )
    expect(photosOf(next, 'photos')).toEqual(['one.jpg', 'two.jpg'])
  })
})

describe('saving', () => {
  const state = run(initialState(day), { type: 'textChanged', id: 'text', text: 'Edited' })
  const snapshot = { location: 'Varanasi', blocks: [] }

  it('keeps the draft exactly as it was when a save fails', () => {
    const failed = run(state, { type: 'saveStarted' }, { type: 'saveFailed', message: 'You are offline.', published: true })
    expect(failed.status).toEqual({ kind: 'failed', message: 'You are offline.', retry: { action: 'save', published: true } })
    expect(failed.blocks).toBe(state.blocks)
    expect(failed.location).toBe(state.location)
    expect(failed.saved).toBe(state.saved)
    expect(failed.published).toBe(true)
  })

  it('records what was saved without touching what is on screen', () => {
    const saved = run(state, { type: 'saveStarted' }, { type: 'saveSucceeded', saved: snapshot, published: false })
    expect(saved.status).toEqual({ kind: 'idle' })
    expect(saved.saved).toBe(snapshot)
    expect(saved.published).toBe(false)
    expect(saved.blocks).toBe(state.blocks)
  })

  it('offers to retry a failed delete', () => {
    const failed = run(state, { type: 'deleteStarted' }, { type: 'deleteFailed', message: 'No connection.' })
    expect(failed.status).toEqual({ kind: 'failed', message: 'No connection.', retry: { action: 'delete' } })
    expect(failed.blocks).toBe(state.blocks)
  })

  it('replaces the draft when a backup is restored', () => {
    const blocks: DraftBlock[] = [{ id: 'r', type: 'text', text: 'From the backup' }]
    const restored = run(state, { type: 'restored', location: 'Sarnath', blocks })
    expect(restored.location).toBe('Sarnath')
    expect(restored.blocks).toBe(blocks)
    expect(restored.saved).toBe(state.saved)
    expect(differsFromSaved(restored.location, restored.blocks, restored.saved)).toBe(true)
  })
})
