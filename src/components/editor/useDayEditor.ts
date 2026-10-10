import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { mediaFolder } from '../../lib/media'
import { store } from '../../lib/store'
import type { Day, ISODate, Trip } from '../../lib/types'
import { backupKey, clearBackup, readBackup, type Backup } from './backup'
import {
  collectPaths,
  differsFromSaved,
  hasContent,
  newPhotosBlock,
  newTextBlock,
  newVideoBlock,
  snapshotOf,
  type DraftBlock,
  type Snapshot,
  type VideoDraft,
} from './blocks'
import { createPersistence } from './persistence'
import { editorReducer, initialState, isUploading, type EditorState } from './reducer'
import type { UploadQueue } from './uploadQueue'
import { useLocalBackup } from './useLocalBackup'
import { useUploads } from './useUploads'

/** Everything the block components can do. The object is stable, so memoised blocks don't re-render for nothing. */
export interface BlockActions {
  /** Each `insert…` adds a block in front of `beforeId`, or at the end for null, and returns the new block's id. */
  insertText(beforeId: string | null): string
  insertVideo(beforeId: string | null): string
  /** Creates the photos block and starts uploading into it. Returns null if no files were chosen. */
  insertPhotos(beforeId: string | null, files: File[]): string | null
  moveBlock(id: string, delta: -1 | 1): void
  /** Asks first if the block has anything in it. Returns false if the owner changed their mind. */
  deleteBlock(id: string): boolean
  setText(id: string, text: string): void
  addPhotos(blockId: string, files: File[]): void
  removePhoto(blockId: string, path: string): void
  movePhoto(blockId: string, path: string, delta: -1 | 1): void
  setPhotoCaption(blockId: string, path: string, caption: string): void
  changeVideo(id: string, change: Partial<Pick<VideoDraft, 'source' | 'url' | 'caption'>>): void
  uploadVideo(id: string, file: File): void
  clearVideo(id: string): void
  retryUpload(uploadId: string): void
  /** Cancels an upload or dismisses a failed one. */
  dropUpload(uploadId: string): void
}

export interface DayEditor {
  state: EditorState
  /** True if the draft differs from what the server has. */
  dirty: boolean
  uploading: boolean
  /** Unsaved changes found on this device that the owner hasn't restored or discarded yet. */
  pendingBackup: Backup | null
  actions: BlockActions
  setLocation(location: string): void
  save(published: boolean): void
  /** Repeats the save or delete that just failed. */
  retry(): void
  deleteDay(): void
  restoreBackup(): void
  discardBackup(): void
}

const DELETE_PROMPTS: Record<DraftBlock['type'], string> = {
  text: 'Delete this text?',
  photos: 'Delete these photos?',
  video: 'Delete this video?',
}

function findBackup(key: string, saved: Snapshot | null): Backup | null {
  const backup = readBackup(key)
  // A backup that matches the server is just a leftover; the backup hook clears it.
  return backup && differsFromSaved(backup.location, backup.blocks, saved) ? backup : null
}

/**
 * The day editor's state and everything that changes it: the reducer, the
 * upload queue, the local backup, saving, and deleting.
 */
export function useDayEditor(trip: Trip, date: ISODate, day: Day | null): DayEditor {
  const [state, dispatch] = useReducer(editorReducer, day, initialState)
  // Async work (a save finishing, an upload landing) needs the state as it is
  // then, not as it was when the work started.
  const stateRef = useRef(state)
  stateRef.current = state

  const navigate = useNavigate()
  const tripId = trip.id
  const key = backupKey(tripId, date)

  // Saving and uploading each need to know about the other, so the queue is
  // reached through a ref that is filled in just below.
  const queueRef = useRef<UploadQueue | null>(null)
  const [persistence] = useState(() =>
    createPersistence({
      tripId,
      date,
      backend: store,
      getState: () => stateRef.current,
      dispatch,
      onIdle: () => queueRef.current?.resume(),
    }),
  )
  const queue = useUploads({
    folder: mediaFolder(tripId, date),
    dispatch,
    // Uploads don't start during a save. Otherwise one could land after the
    // save's contents were fixed but before its clean-up ran, and be deleted.
    isHeld: persistence.isBusy,
    onStored: persistence.own,
    onDiscarded: persistence.disown,
  })
  queueRef.current = queue

  const dirty = useMemo(
    () => differsFromSaved(state.location, state.blocks, state.saved),
    [state.location, state.blocks, state.saved],
  )
  const uploading = isUploading(state)

  // Read during the first render, before the backup hook's effect can touch storage.
  const [pendingBackup, setPendingBackup] = useState(() => findBackup(key, state.saved))

  const forgetBackup = useLocalBackup({
    key,
    location: state.location,
    blocks: state.blocks,
    dirty,
    paused: pendingBackup !== null,
  })

  const unsafeToLeave = dirty || uploading
  useEffect(() => {
    if (!unsafeToLeave) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers only show the prompt when returnValue is set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsafeToLeave])

  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Uploads that were taken out of the draft again without a save in
      // between would otherwise stay in storage for good.
      persistence.leave()
    }
  }, [persistence])

  const save = useCallback(
    (published: boolean) => {
      const current = stateRef.current
      const empty = snapshotOf(current.location, current.blocks).blocks.length === 0
      // Publishing a blank page is almost always a slip of the thumb.
      if (published && !current.published && empty && !window.confirm('This day has nothing in it yet. Publish it anyway?')) {
        return
      }
      void persistence.save(published)
    },
    [persistence],
  )

  const runDelete = useCallback(async () => {
    if (!(await persistence.deleteDay())) return
    forgetBackup()
    // If the owner has already gone somewhere else, they shouldn't be pulled back.
    if (mounted.current) navigate(`/admin/trips/${tripId}`)
  }, [persistence, forgetBackup, navigate, tripId])

  const deleteDay = useCallback(() => {
    if (persistence.isBusy()) return
    if (window.confirm("Delete this day and everything in it? This can't be undone.")) void runDelete()
  }, [persistence, runDelete])

  const retry = useCallback(() => {
    const { status } = stateRef.current
    if (status.kind !== 'failed') return
    if (status.retry.action === 'delete') void runDelete()
    else void persistence.save(status.retry.published)
  }, [persistence, runDelete])

  const restoreBackup = useCallback(() => {
    if (!pendingBackup) return
    // The backup may refer to uploads that were never saved; they are this visit's to clean up now.
    persistence.own(collectPaths(pendingBackup.blocks))
    dispatch({ type: 'restored', location: pendingBackup.location, blocks: pendingBackup.blocks })
    setPendingBackup(null)
  }, [pendingBackup, persistence])

  const discardBackup = useCallback(() => {
    if (!pendingBackup) return
    if (!window.confirm('Discard the unsaved changes on this device?')) return
    clearBackup(key)
    // Uploads that only the discarded draft referred to have no other use.
    void persistence.deleteUnused(collectPaths(pendingBackup.blocks), stateRef.current.saved)
    setPendingBackup(null)
  }, [pendingBackup, key, persistence])

  const actions = useMemo<BlockActions>(
    () => ({
      insertText(beforeId) {
        const block = newTextBlock()
        dispatch({ type: 'blockInserted', block, beforeId })
        return block.id
      },
      insertVideo(beforeId) {
        const block = newVideoBlock()
        dispatch({ type: 'blockInserted', block, beforeId })
        return block.id
      },
      insertPhotos(beforeId, files) {
        if (files.length === 0) return null
        const block = newPhotosBlock()
        dispatch({ type: 'blockInserted', block, beforeId })
        queue.addPhotos(block.id, files)
        return block.id
      },
      moveBlock: (id, delta) => dispatch({ type: 'blockMoved', id, delta }),
      deleteBlock(id) {
        const current = stateRef.current
        const block = current.blocks.find((candidate) => candidate.id === id)
        if (!block) return false
        const worthAsking = hasContent(block) || current.uploads.some((upload) => upload.blockId === id)
        if (worthAsking && !window.confirm(DELETE_PROMPTS[block.type])) return false
        queue.dropBlock(id)
        dispatch({ type: 'blockRemoved', id })
        return true
      },
      setText: (id, text) => dispatch({ type: 'textChanged', id, text }),
      addPhotos: (blockId, files) => queue.addPhotos(blockId, files),
      removePhoto: (blockId, path) => dispatch({ type: 'photoRemoved', blockId, path }),
      movePhoto: (blockId, path, delta) => dispatch({ type: 'photoMoved', blockId, path, delta }),
      setPhotoCaption: (blockId, path, caption) => dispatch({ type: 'photoCaptionChanged', blockId, path, caption }),
      changeVideo: (id, change) => dispatch({ type: 'videoChanged', id, change }),
      uploadVideo: (id, file) => queue.setVideo(id, file),
      clearVideo: (id) => dispatch({ type: 'videoCleared', id }),
      retryUpload: (uploadId) => queue.retry(uploadId),
      dropUpload: (uploadId) => queue.drop(uploadId),
    }),
    [queue],
  )

  const setLocation = useCallback((location: string) => dispatch({ type: 'locationChanged', location }), [])

  return {
    state,
    dirty,
    uploading,
    pendingBackup,
    actions,
    setLocation,
    save,
    retry,
    deleteDay,
    restoreBackup,
    discardBackup,
  }
}
