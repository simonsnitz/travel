import { useCallback, useEffect, useRef } from 'react'
import { clearBackup, writeBackup } from './backup'
import type { DraftBlock } from './blocks'

const WRITE_DELAY_MS = 1000

interface Options {
  key: string
  location: string
  blocks: DraftBlock[]
  /** Whether the draft differs from the saved version. A draft that matches needs no backup. */
  dirty: boolean
  /** While true the stored backup is left untouched: it is still waiting to be restored or discarded. */
  paused: boolean
}

/**
 * Keeps a copy of the unsaved draft in localStorage, written about a second
 * after the last edit, and removes it once the draft matches the saved version
 * again. Returns `forget`, which removes the backup and stops writing for good
 * (used when the day is deleted).
 */
export function useLocalBackup({ key, location, blocks, dirty, paused }: Options): () => void {
  const latest = useRef({ location, blocks, dirty, paused })
  latest.current = { location, blocks, dirty, paused }
  /** When the draft last changed, if that change hasn't been written yet. */
  const editedAt = useRef<number | null>(null)
  const stopped = useRef(false)

  const flush = useCallback(() => {
    const at = editedAt.current
    const current = latest.current
    if (at === null || stopped.current || current.paused) return
    editedAt.current = null
    if (current.dirty) writeBackup(key, { location: current.location, blocks: current.blocks, editedAt: at })
  }, [key])

  useEffect(() => {
    if (paused || stopped.current) return
    if (!dirty) {
      editedAt.current = null
      clearBackup(key)
      return
    }
    editedAt.current = Date.now()
    const timer = setTimeout(flush, WRITE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [key, location, blocks, dirty, paused, flush])

  // Phones often discard a page in the background without any warning, so the
  // pending write also happens when the page is hidden and when the editor closes.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return useCallback(() => {
    stopped.current = true
    editedAt.current = null
    clearBackup(key)
  }, [key])
}
