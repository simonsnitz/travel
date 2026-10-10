import { CircleAlert, CircleCheck } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Status } from './reducer'
import styles from './ActionBar.module.css'

interface ActionBarProps {
  status: Status
  /** The draft differs from what the server has. */
  dirty: boolean
  uploading: boolean
  /** The day has been saved at least once. */
  exists: boolean
  published: boolean
  /** A local backup is waiting to be restored or discarded, and nothing else can happen until it is. */
  locked: boolean
  onSave(published: boolean): void
  onRetry(): void
}

const SLOW_SAVE_MS = 8000

/** True once a save has been running long enough that the owner deserves some reassurance. */
function useSlow(saving: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!saving) return
    const timer = setTimeout(() => setSlow(true), SLOW_SAVE_MS)
    return () => {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [saving])
  return slow
}

/**
 * The bar pinned to the bottom of the editor: what state the day is in, and
 * the buttons that save it.
 */
export default function ActionBar({ status, dirty, uploading, exists, published, locked, onSave, onRetry }: ActionBarProps) {
  const bar = useRef<HTMLDivElement>(null)
  const saving = status.kind === 'saving'
  const slow = useSlow(saving)
  const failed = status.kind === 'failed' ? status : null
  const blocked = locked || uploading || saving || status.kind === 'deleting'

  // The bar sits over the bottom of the page, so the page needs to know how
  // tall it is: to leave that much room under the last block on phones, and so
  // that tabbing to a control never scrolls it to rest underneath the bar.
  useLayoutEffect(() => {
    const element = bar.current
    if (!element) return
    const root = document.documentElement
    const publish = () => {
      const height = element.offsetHeight
      root.style.setProperty('--editor-bar-height', `${height}px`)
      root.style.scrollPaddingBottom = `${height + 24}px`
    }
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--editor-bar-height')
      root.style.scrollPaddingBottom = ''
    }
  }, [])

  let message: string
  if (locked) message = 'Restore or discard the changes above to carry on.'
  else if (saving) message = slow ? 'Still saving. Your changes are also kept on this device.' : 'Saving…'
  else if (status.kind === 'deleting') message = 'Deleting…'
  else if (failed) message = `${failed.retry.action === 'delete' ? 'Not deleted.' : 'Not saved.'} ${failed.message}`
  else if (uploading) message = 'Wait for uploads to finish'
  else if (dirty) message = 'Unsaved changes'
  else if (exists) message = 'All changes saved'
  else message = 'Nothing to save yet'

  const saved = !locked && !saving && status.kind === 'idle' && !uploading && !dirty && exists

  return (
    <div ref={bar} className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.status}>
          {/* One live region for every state, so a screen reader hears each change; a failure interrupts. */}
          <p
            className={failed ? `${styles.message} ${styles.failed}` : saved ? `${styles.message} ${styles.saved}` : styles.message}
            role="status"
            aria-live={failed ? 'assertive' : 'polite'}
          >
            {saving && <span className={`spinner ${styles.spinner}`} />}
            {failed && <CircleAlert size={16} />}
            {saved && <CircleCheck size={16} />}
            <span>
              {message}
              {failed && uploading && ' Wait for uploads to finish.'}
            </span>
          </p>
          {failed && (
            <button type="button" className={`btn ${styles.small}`} disabled={blocked} onClick={onRetry}>
              Retry
            </button>
          )}
        </div>

        <div className={styles.actions}>
          {published ? (
            <>
              <button type="button" className="btn" disabled={blocked} onClick={() => onSave(false)}>
                Unpublish
              </button>
              <button type="button" className="btn btn-primary" disabled={blocked || !dirty} onClick={() => onSave(true)}>
                Update
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" disabled={blocked || !dirty} onClick={() => onSave(false)}>
                Save draft
              </button>
              <button type="button" className="btn btn-primary" disabled={blocked} onClick={() => onSave(true)}>
                Publish
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
