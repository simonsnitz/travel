import type { Store } from '../../lib/store'
import type { ISODate } from '../../lib/types'
import { collectPaths, snapshotOf, stalePaths, type Snapshot } from './blocks'
import { messageOf } from '../../lib/errors'
import { isUploading, type EditorAction, type EditorState } from './reducer'

export interface PersistenceOptions {
  tripId: string
  date: ISODate
  backend: Pick<Store, 'saveDay' | 'deleteDay' | 'deleteMedia'>
  /** The editor's state as it is at the moment of the call, not as it was when a save began. */
  getState(): EditorState
  dispatch(action: EditorAction): void
  /** Called when a save or delete attempt is over, so that uploads held back meanwhile can start. */
  onIdle(): void
}

export interface Persistence {
  /** Saves the draft as it is now. Resolves when the attempt is over, whether or not it worked. */
  save(published: boolean): Promise<void>
  /** Deletes the day from the server. Resolves to true once it is gone. */
  deleteDay(): Promise<boolean>
  /** Deletes those of `candidates` that neither `saved` nor the draft on screen refers to. Never rejects. */
  deleteUnused(candidates: Iterable<string>, saved: Snapshot | null): Promise<void>
  /** Clears out what this visit uploaded and then dropped, when the editor closes without a save. */
  leave(): void
  /** True while a save or delete is in flight. */
  isBusy(): boolean
  /** Makes this visit answerable for stored files: after a save, the ones the day doesn't use are deleted. */
  own(paths: string[]): void
  disown(paths: string[]): void
}

/**
 * Saving and deleting a day, and the tidying of stored media that goes with
 * it. Kept apart from React so the rules can be tested: a failed save changes
 * nothing, and a file is only ever deleted when neither the saved day nor the
 * draft on screen uses it.
 */
export function createPersistence(options: PersistenceOptions): Persistence {
  const { tripId, date, backend } = options
  /**
   * Stored files this visit is answerable for: uploaded here, brought back by
   * restoring a backup, or left over from a clean-up that failed.
   */
  const owned = new Set<string>()
  let busy = false

  async function deleteUnused(candidates: Iterable<string>, saved: Snapshot | null): Promise<void> {
    let stale: string[] = []
    try {
      // Whatever is on screen is kept too, even if it isn't saved yet.
      const keep = [...collectPaths(saved?.blocks ?? []), ...collectPaths(options.getState().blocks)]
      stale = stalePaths(candidates, keep)
      if (stale.length === 0) return
      // Remembered until the delete succeeds, so that a failure is retried after the next save.
      stale.forEach((path) => owned.add(path))
      await backend.deleteMedia(stale)
      stale.forEach((path) => owned.delete(path))
    } catch (error) {
      // Leftover files cost a little storage; they must never cost the owner a save.
      console.error('Could not remove media that is no longer used.', stale, error)
    }
  }

  return {
    async save(published) {
      const current = options.getState()
      if (busy || isUploading(current)) return
      busy = true
      const previous = current.saved
      const snapshot = snapshotOf(current.location, current.blocks)
      options.dispatch({ type: 'saveStarted' })
      try {
        const saved = await backend.saveDay({ tripId, date, location: snapshot.location, blocks: snapshot.blocks, published })
        options.dispatch({ type: 'saveSucceeded', saved: snapshot, published: saved.published })
        void deleteUnused([...collectPaths(previous?.blocks ?? []), ...owned], snapshot)
      } catch (error) {
        options.dispatch({ type: 'saveFailed', message: messageOf(error), published })
      } finally {
        busy = false
        options.onIdle()
      }
    },

    async deleteDay() {
      if (busy) return false
      busy = true
      options.dispatch({ type: 'deleteStarted' })
      try {
        await backend.deleteDay(tripId, date)
        // Stays busy: the editor is about to close, and nothing should start in between.
        return true
      } catch (error) {
        busy = false
        options.dispatch({ type: 'deleteFailed', message: messageOf(error) })
        options.onIdle()
        return false
      }
    },

    deleteUnused,

    leave() {
      // A save still in flight may refer to these files; its own clean-up deals with them.
      if (!busy) void deleteUnused([...owned], options.getState().saved)
    },

    isBusy: () => busy,
    own: (paths) => paths.forEach((path) => owned.add(path)),
    disown: (paths) => paths.forEach((path) => owned.delete(path)),
  }
}
