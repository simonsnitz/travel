import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../../lib/types'
import type { EditorAction } from './reducer'
import { createUploadQueue, MAX_PHOTO_UPLOADS } from './uploadQueue'

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every pending promise callback run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const file = (name: string) => new File(['x'], name)
const photoFor = (name: string): Photo => ({ path: `${name}.jpg`, thumbPath: `${name}_thumb.jpg`, width: 4, height: 3 })

function setup() {
  const actions: EditorAction[] = []
  const photoUploads: { name: string; result: Deferred<Photo> }[] = []
  const videoUploads: { name: string; result: Deferred<{ path: string }>; onProgress(fraction: number): void; signal: AbortSignal }[] = []
  const deleted: string[][] = []
  const stored: string[][] = []
  const discarded: string[][] = []
  let held = false
  let deleteFails = false

  const queue = createUploadQueue({
    backend: {
      uploadPhoto(upload) {
        const result = deferred<Photo>()
        photoUploads.push({ name: upload.name, result })
        return result.promise
      },
      uploadVideo(upload, onProgress, signal) {
        const result = deferred<{ path: string }>()
        videoUploads.push({ name: upload.name, result, onProgress, signal })
        return result.promise
      },
      async deleteMedia(paths) {
        if (deleteFails) throw new Error('offline')
        deleted.push(paths)
      },
    },
    dispatch: (action) => void actions.push(action),
    isHeld: () => held,
    onStored: (paths) => void stored.push(paths),
    onDiscarded: (paths) => void discarded.push(paths),
  })

  return {
    queue,
    actions,
    photoUploads,
    videoUploads,
    deleted,
    stored,
    discarded,
    hold: (value: boolean) => void (held = value),
    failDeletes: () => void (deleteFails = true),
    types: () => actions.map((action) => action.type),
    /** Ids of the queued uploads, in the order they were queued. */
    ids: () => actions.flatMap((action) => (action.type === 'uploadQueued' ? [action.upload.id] : [])),
  }
}

describe('upload queue', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uploads at most three photos at a time, in the order they were chosen', async () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c', 'd', 'e'].map(file))

    expect(t.ids()).toHaveLength(5)
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c'])
    expect(MAX_PHOTO_UPLOADS).toBe(3)

    t.photoUploads[1].result.resolve(photoFor('b'))
    await settle()
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c', 'd'])

    t.photoUploads[0].result.reject(new Error('offline'))
    await settle()
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('reports each photo against the upload it belongs to', async () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a'), file('b')])
    const [a, b] = t.ids()

    // The second photo happens to finish first.
    t.photoUploads[1].result.resolve(photoFor('b'))
    await settle()
    t.photoUploads[0].result.resolve(photoFor('a'))
    await settle()

    expect(t.actions.filter((action) => action.type === 'photoUploaded')).toEqual([
      { type: 'photoUploaded', id: b, photo: photoFor('b') },
      { type: 'photoUploaded', id: a, photo: photoFor('a') },
    ])
    expect(t.stored).toEqual([
      ['b.jpg', 'b_thumb.jpg'],
      ['a.jpg', 'a_thumb.jpg'],
    ])
    expect(t.deleted).toEqual([])
  })

  it('describes a queued photo for the editor', () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a.jpg')])
    const [queued] = t.actions
    expect(queued).toMatchObject({
      type: 'uploadQueued',
      upload: { blockId: 'block', kind: 'photo', name: 'a.jpg', size: 1, status: 'queued', progress: 0, error: '' },
    })
    expect(t.types()).toEqual(['uploadQueued', 'uploadStarted'])
  })

  it('numbers uploads in the order the files were chosen', () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b'].map(file))
    t.queue.addPhotos('other', [file('c')])
    const orders = t.actions.flatMap((action) => (action.type === 'uploadQueued' ? [action.upload.order] : []))
    expect(orders).toEqual([0, 1, 2])
  })

  it('reports a failure and retries with the same file', async () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a')])
    const [id] = t.ids()

    t.photoUploads[0].result.reject(new Error('You are offline.'))
    await settle()
    expect(t.actions.at(-1)).toEqual({ type: 'uploadFailed', id, error: 'You are offline.' })

    t.queue.retry(id)
    expect(t.types().slice(-2)).toEqual(['uploadRetried', 'uploadStarted'])
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'a'])

    t.photoUploads[1].result.resolve(photoFor('a'))
    await settle()
    expect(t.actions.at(-1)).toEqual({ type: 'photoUploaded', id, photo: photoFor('a') })
  })

  it('does not retry an upload that is still running, or one it has never heard of', () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a')])
    const before = t.actions.length
    t.queue.retry(t.ids()[0])
    t.queue.retry('unknown')
    expect(t.actions).toHaveLength(before)
    expect(t.photoUploads).toHaveLength(1)
  })

  it('deletes a photo that arrives after its upload was removed', async () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a'), file('b')])
    const [a] = t.ids()

    t.queue.drop(a)
    expect(t.actions.at(-1)).toEqual({ type: 'uploadDropped', id: a })

    t.photoUploads[0].result.resolve(photoFor('a'))
    t.photoUploads[1].result.resolve(photoFor('b'))
    await settle()

    expect(t.actions.filter((action) => action.type === 'photoUploaded')).toHaveLength(1)
    expect(t.deleted).toEqual([['a.jpg', 'a_thumb.jpg']])
    expect(t.discarded).toEqual([['a.jpg', 'a_thumb.jpg']])
  })

  it('deletes everything that arrives for a deleted block, and nothing else', async () => {
    const t = setup()
    t.queue.addPhotos('doomed', [file('a'), file('b')])
    t.queue.addPhotos('kept', [file('c')])

    t.queue.dropBlock('doomed')
    for (const [index, name] of ['a', 'b', 'c'].entries()) t.photoUploads[index].result.resolve(photoFor(name))
    await settle()

    expect(t.deleted.flat().sort()).toEqual(['a.jpg', 'a_thumb.jpg', 'b.jpg', 'b_thumb.jpg'])
    expect(t.actions.filter((action) => action.type === 'photoUploaded')).toEqual([
      { type: 'photoUploaded', id: t.ids()[2], photo: photoFor('c') },
    ])
  })

  it('stays quiet when a dropped upload fails', async () => {
    const t = setup()
    t.queue.addPhotos('block', [file('a')])
    t.queue.drop(t.ids()[0])
    const before = t.actions.length
    t.photoUploads[0].result.reject(new Error('offline'))
    await settle()
    expect(t.actions).toHaveLength(before)
  })

  it('never starts a photo that was removed while waiting its turn', async () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c', 'd', 'e'].map(file))
    t.queue.drop(t.ids()[3])
    t.photoUploads[0].result.resolve(photoFor('a'))
    await settle()
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c', 'e'])
  })

  it('lets the next photo start when a stalled upload is removed', () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c', 'd'].map(file))
    expect(t.photoUploads).toHaveLength(3)
    // "a" never settles (a dead connection); removing it must not block "d" for ever.
    t.queue.drop(t.ids()[0])
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('still counts three at a time after a stalled upload finally settles', async () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c', 'd', 'e', 'f'].map(file))
    t.queue.drop(t.ids()[0])
    expect(t.photoUploads).toHaveLength(4)
    t.photoUploads[0].result.reject(new Error('timed out'))
    await settle()
    // b, c and d are still running, so e has to keep waiting.
    expect(t.photoUploads).toHaveLength(4)
    t.photoUploads[1].result.resolve(photoFor('b'))
    await settle()
    expect(t.photoUploads.map((upload) => upload.name)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('waits while held and starts on resume', () => {
    const t = setup()
    t.hold(true)
    t.queue.addPhotos('block', [file('a')])
    t.queue.setVideo('video', file('clip.mp4'))
    expect(t.types()).toEqual(['uploadQueued', 'uploadQueued'])
    expect(t.photoUploads).toHaveLength(0)
    expect(t.videoUploads).toHaveLength(0)

    t.queue.resume()
    expect(t.photoUploads).toHaveLength(0)

    t.hold(false)
    t.queue.resume()
    expect(t.photoUploads).toHaveLength(1)
    expect(t.videoUploads).toHaveLength(1)
  })

  it('uploads a video alongside photos and reports whole-percent progress', async () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c'].map(file))
    t.queue.setVideo('video', file('clip.mp4'))
    expect(t.videoUploads).toHaveLength(1)
    const id = t.ids()[3]

    const { onProgress, result } = t.videoUploads[0]
    onProgress(0.25)
    onProgress(0.251)
    onProgress(0.5)
    expect(t.actions.filter((action) => action.type === 'uploadProgress')).toEqual([
      { type: 'uploadProgress', id, progress: 0.25 },
      { type: 'uploadProgress', id, progress: 0.5 },
    ])

    result.resolve({ path: 'clip.mp4' })
    await settle()
    expect(t.actions.at(-1)).toEqual({ type: 'videoUploaded', id, path: 'clip.mp4' })
    expect(t.stored).toEqual([['clip.mp4']])
  })

  it('cancels a video without reporting an error', async () => {
    const t = setup()
    t.queue.setVideo('video', file('clip.mp4'))
    const [id] = t.ids()
    const { signal, result, onProgress } = t.videoUploads[0]

    t.queue.drop(id)
    expect(signal.aborted).toBe(true)
    expect(t.actions.at(-1)).toEqual({ type: 'uploadDropped', id })

    const before = t.actions.length
    onProgress(0.9)
    result.reject(new DOMException('Upload cancelled.', 'AbortError'))
    await settle()
    expect(t.actions).toHaveLength(before)
  })

  it('treats an abort it did not ask for as a cancellation, not a failure', async () => {
    const t = setup()
    t.queue.setVideo('video', file('clip.mp4'))
    const [id] = t.ids()
    t.videoUploads[0].result.reject(new DOMException('Upload cancelled.', 'AbortError'))
    await settle()
    expect(t.actions.at(-1)).toEqual({ type: 'uploadDropped', id })
    expect(t.types()).not.toContain('uploadFailed')
  })

  it('shows why a video was rejected and can retry it', async () => {
    const t = setup()
    t.queue.setVideo('video', file('clip.mp4'))
    const [id] = t.ids()
    t.videoUploads[0].result.reject(new Error('"clip.mp4" is 80 MB. Uploaded clips can be at most 50 MB.'))
    await settle()
    expect(t.actions.at(-1)).toMatchObject({ type: 'uploadFailed', id, error: expect.stringContaining('at most 50 MB') })

    t.queue.retry(id)
    expect(t.videoUploads).toHaveLength(2)
  })

  it('replaces a pending clip when another is chosen for the same block', async () => {
    const t = setup()
    t.queue.setVideo('video', file('first.mp4'))
    t.queue.setVideo('video', file('second.mp4'))
    expect(t.videoUploads[0].signal.aborted).toBe(true)
    expect(t.videoUploads[1].signal.aborted).toBe(false)

    // The first upload finishes anyway: its file is unwanted.
    t.videoUploads[0].result.resolve({ path: 'first.mp4' })
    t.videoUploads[1].result.resolve({ path: 'second.mp4' })
    await settle()
    expect(t.deleted).toEqual([['first.mp4']])
    expect(t.actions.filter((action) => action.type === 'videoUploaded')).toEqual([
      { type: 'videoUploaded', id: t.ids()[1], path: 'second.mp4' },
    ])
  })

  it('deletes whatever still arrives after the editor has closed', async () => {
    const t = setup()
    t.queue.addPhotos('block', ['a', 'b', 'c', 'd'].map(file))
    t.queue.setVideo('video', file('clip.mp4'))
    const before = t.actions.length

    t.queue.close()
    expect(t.videoUploads[0].signal.aborted).toBe(true)
    t.photoUploads[0].result.resolve(photoFor('a'))
    t.videoUploads[0].result.resolve({ path: 'clip.mp4' })
    await settle()

    expect(t.actions).toHaveLength(before)
    expect(t.deleted.flat().sort()).toEqual(['a.jpg', 'a_thumb.jpg', 'clip.mp4'])
    // The photo that was still waiting never starts.
    expect(t.photoUploads).toHaveLength(3)

    t.queue.addPhotos('block', [file('late')])
    expect(t.actions).toHaveLength(before)
  })

  it('works again after being reopened', () => {
    const t = setup()
    t.queue.close()
    t.queue.open()
    t.queue.addPhotos('block', [file('a')])
    expect(t.photoUploads).toHaveLength(1)
  })

  it('leaves an unwanted file on the list when it cannot be deleted', async () => {
    const t = setup()
    t.failDeletes()
    t.queue.addPhotos('block', [file('a')])
    t.queue.drop(t.ids()[0])
    t.photoUploads[0].result.resolve(photoFor('a'))
    await settle()
    expect(t.stored).toEqual([['a.jpg', 'a_thumb.jpg']])
    expect(t.discarded).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  it('turns a backend that throws straight away into a failed upload', async () => {
    const actions: EditorAction[] = []
    const queue = createUploadQueue({
      backend: {
        uploadPhoto() {
          throw new Error('Sign in to make changes.')
        },
        uploadVideo() {
          throw new Error('Sign in to make changes.')
        },
        deleteMedia: async () => {},
      },
      dispatch: (action) => void actions.push(action),
      isHeld: () => false,
      onStored: () => {},
      onDiscarded: () => {},
    })
    queue.addPhotos('block', [file('a')])
    queue.setVideo('video', file('clip.mp4'))
    await settle()
    expect(actions.filter((action) => action.type === 'uploadFailed').map((action) => action.error)).toEqual([
      'Sign in to make changes.',
      'Sign in to make changes.',
    ])
  })
})
