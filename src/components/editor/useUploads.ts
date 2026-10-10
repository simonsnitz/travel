import { useEffect, useRef, useState } from 'react'
import { store } from '../../lib/store'
import type { EditorAction } from './reducer'
import { createUploadQueue, type UploadQueue } from './uploadQueue'

interface Options {
  /** Storage folder for the day's media. */
  folder: string
  dispatch(action: EditorAction): void
  isHeld(): boolean
  onStored(paths: string[]): void
  onDiscarded(paths: string[]): void
}

/** One upload queue for the lifetime of the editor, wired to the store and closed when the editor goes away. */
export function useUploads(options: Options): UploadQueue {
  const latest = useRef(options)
  latest.current = options

  const [queue] = useState(() =>
    createUploadQueue({
      backend: {
        uploadPhoto: (file) => store.uploadPhoto(file, latest.current.folder),
        uploadVideo: (file, onProgress, signal) => store.uploadVideo(file, latest.current.folder, onProgress, signal),
        deleteMedia: (paths) => store.deleteMedia(paths),
      },
      dispatch: (action) => latest.current.dispatch(action),
      isHeld: () => latest.current.isHeld(),
      onStored: (paths) => latest.current.onStored(paths),
      onDiscarded: (paths) => latest.current.onDiscarded(paths),
    }),
  )

  useEffect(() => {
    queue.open()
    return () => queue.close()
  }, [queue])

  return queue
}
