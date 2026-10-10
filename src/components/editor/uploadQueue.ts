import { newId } from '../../lib/media'
import type { Photo } from '../../lib/types'
import { isAbortError, messageOf } from '../../lib/errors'
import type { EditorAction } from './reducer'

export const MAX_PHOTO_UPLOADS = 3

/** The storage calls the queue makes, already bound to the day's media folder. */
export interface UploadBackend {
  uploadPhoto(file: File): Promise<Photo>
  uploadVideo(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<{ path: string }>
  deleteMedia(paths: string[]): Promise<void>
}

export interface UploadQueueOptions {
  backend: UploadBackend
  dispatch(action: EditorAction): void
  /** Uploads wait while this returns true. Call `resume()` when it stops being true. */
  isHeld(): boolean
  /** Called with the paths of every file that reaches storage, wanted or not. */
  onStored(paths: string[]): void
  /** Called when files nothing wanted any more have been deleted again. */
  onDiscarded(paths: string[]): void
}

export interface UploadQueue {
  /** Uploads photos into an existing photos block, at most `MAX_PHOTO_UPLOADS` at a time. */
  addPhotos(blockId: string, files: File[]): void
  /** Uploads a clip for a video block, replacing any upload the block was still waiting on. */
  setVideo(blockId: string, file: File): void
  /** Tries a failed upload again with the same file. */
  retry(id: string): void
  /** Cancels an upload, or dismisses a failed one. */
  drop(id: string): void
  /** Abandons every upload of a block that is being deleted. */
  dropBlock(blockId: string): void
  /** Starts whatever was waiting on `isHeld()`. */
  resume(): void
  open(): void
  /** Abandons everything. Uploads that still finish afterwards are deleted from storage. */
  close(): void
}

interface Job {
  id: string
  blockId: string
  kind: 'photo' | 'video'
  /** Kept so that a failed upload can be retried without choosing the file again. */
  file: File
  previewUrl: string
  /** Set while a video is uploading, so it can be cancelled. */
  controller: AbortController | null
  running: boolean
  /** True while the job counts towards `MAX_PHOTO_UPLOADS`. */
  holdsSlot: boolean
}

function createPreview(file: File): string {
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

// Turns a synchronous throw into a rejection, so one code path handles every failure.
const attempt = <T>(run: () => Promise<T>): Promise<T> => new Promise<T>((resolve) => resolve(run()))

/**
 * Runs the editor's uploads and reports what happens to them as reducer actions.
 *
 * `jobs` is the queue's own record of the uploads somebody still wants. It is
 * updated the moment an upload is dropped, without waiting for React to render,
 * so a result that arrives for a dropped upload is recognised reliably and its
 * file is deleted instead of being left behind in storage.
 */
export function createUploadQueue(options: UploadQueueOptions): UploadQueue {
  const jobs = new Map<string, Job>()
  let waiting: string[] = []
  let runningPhotos = 0
  let chosen = 0
  let closed = false

  const release = (job: Job) => {
    if (!job.previewUrl) return
    URL.revokeObjectURL(job.previewUrl)
    job.previewUrl = ''
  }

  const freeSlot = (job: Job) => {
    if (!job.holdsSlot) return
    job.holdsSlot = false
    runningPhotos -= 1
  }

  const abandon = (job: Job) => {
    jobs.delete(job.id)
    job.controller?.abort()
    release(job)
    // A photo upload can't be cancelled, and on a dead connection it may never
    // settle. Giving its slot back now keeps it from blocking the photos behind it.
    freeSlot(job)
  }

  const discard = (paths: string[]) => {
    attempt(() => options.backend.deleteMedia(paths)).then(
      () => options.onDiscarded(paths),
      // Not fatal: the paths stay on the editor's list and are removed after the next save.
      (error: unknown) => console.error('Could not remove an upload that is no longer needed.', error),
    )
  }

  const succeed = (job: Job, paths: string[], action: EditorAction) => {
    job.running = false
    job.controller = null
    options.onStored(paths)
    if (jobs.get(job.id) !== job) {
      discard(paths)
      return
    }
    jobs.delete(job.id)
    release(job)
    options.dispatch(action)
  }

  const fail = (job: Job, error: unknown) => {
    job.running = false
    job.controller = null
    if (jobs.get(job.id) !== job) return
    if (isAbortError(error)) {
      // Cancelled, which is not a failure to report.
      abandon(job)
      options.dispatch({ type: 'uploadDropped', id: job.id })
      return
    }
    // The job stays in `jobs`, with its file, so that it can be retried.
    options.dispatch({ type: 'uploadFailed', id: job.id, error: messageOf(error) })
  }

  const start = (job: Job) => {
    job.running = true
    options.dispatch({ type: 'uploadStarted', id: job.id })

    if (job.kind === 'photo') {
      job.holdsSlot = true
      runningPhotos += 1
      attempt(() => options.backend.uploadPhoto(job.file))
        .then(
          (photo) => succeed(job, [photo.path, photo.thumbPath], { type: 'photoUploaded', id: job.id, photo }),
          (error: unknown) => fail(job, error),
        )
        .finally(() => {
          freeSlot(job)
          pump()
        })
      return
    }

    const controller = new AbortController()
    job.controller = controller
    let lastPercent = -1
    const onProgress = (fraction: number) => {
      // Whole percents are all the progress bar shows; skip the renders in between.
      const percent = Math.round(fraction * 100)
      if (percent === lastPercent || jobs.get(job.id) !== job) return
      lastPercent = percent
      options.dispatch({ type: 'uploadProgress', id: job.id, progress: fraction })
    }
    attempt(() => options.backend.uploadVideo(job.file, onProgress, controller.signal)).then(
      ({ path }) => succeed(job, [path], { type: 'videoUploaded', id: job.id, path }),
      (error: unknown) => fail(job, error),
    )
  }

  function pump() {
    if (closed || options.isHeld()) return
    const stillWaiting: string[] = []
    for (const id of waiting) {
      const job = jobs.get(id)
      if (!job || job.running) continue
      if (job.kind === 'photo' && runningPhotos >= MAX_PHOTO_UPLOADS) stillWaiting.push(id)
      else start(job)
    }
    waiting = stillWaiting
  }

  const enqueue = (blockId: string, kind: Job['kind'], file: File) => {
    const job: Job = {
      id: newId(),
      blockId,
      kind,
      file,
      previewUrl: kind === 'photo' ? createPreview(file) : '',
      controller: null,
      running: false,
      holdsSlot: false,
    }
    jobs.set(job.id, job)
    waiting.push(job.id)
    options.dispatch({
      type: 'uploadQueued',
      upload: {
        id: job.id,
        blockId,
        order: chosen++,
        kind,
        name: file.name,
        size: file.size,
        previewUrl: job.previewUrl,
        status: 'queued',
        progress: 0,
        error: '',
      },
    })
  }

  return {
    addPhotos(blockId, files) {
      if (closed) return
      for (const file of files) enqueue(blockId, 'photo', file)
      pump()
    },
    setVideo(blockId, file) {
      if (closed) return
      for (const job of [...jobs.values()]) {
        if (job.blockId === blockId && job.kind === 'video') abandon(job)
      }
      enqueue(blockId, 'video', file)
      pump()
    },
    retry(id) {
      const job = jobs.get(id)
      if (closed || !job || job.running || waiting.includes(id)) return
      waiting.push(id)
      options.dispatch({ type: 'uploadRetried', id })
      pump()
    },
    drop(id) {
      const job = jobs.get(id)
      if (job) abandon(job)
      options.dispatch({ type: 'uploadDropped', id })
      pump()
    },
    dropBlock(blockId) {
      for (const job of [...jobs.values()]) {
        if (job.blockId === blockId) abandon(job)
      }
      pump()
    },
    resume: pump,
    open() {
      closed = false
    },
    close() {
      closed = true
      for (const job of [...jobs.values()]) abandon(job)
      waiting = []
    },
  }
}
