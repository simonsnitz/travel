import { HardDrive } from 'lucide-react'
import { STORAGE_LIMIT_BYTES } from '../../config'
import { store } from '../../lib/store'
import { useAsync } from '../../lib/useAsync'
import { summariseStorage } from './storageSummary'
import styles from './StorageUsage.module.css'

/**
 * A line on the admin's front page saying how much of the storage allowance
 * the photos and clips take up. It turns into a warning as the allowance runs
 * out, and says nothing if the total can't be worked out.
 */
export default function StorageUsage() {
  const { data: usage } = useAsync(() => store.storageUsage(), [])
  if (!usage) return null

  const { used, allowance, percent, level } = summariseStorage(usage.bytes, STORAGE_LIMIT_BYTES)

  return (
    <div className={`${styles.usage} ${level === 'fine' ? '' : styles.warning}`} role="status">
      <HardDrive aria-hidden size={18} />
      <div className={styles.body}>
        <p>
          {level === 'full' ? (
            <>
              Storage is full: {used} of {allowance} used. New photos and clips may be refused until some are removed.
            </>
          ) : level === 'filling' ? (
            <>
              Storage is {percent}% full: {used} of {allowance} used. Videos added as YouTube or Vimeo links take up no
              space.
            </>
          ) : (
            <>
              {used} of {allowance} of storage used, counting photos and clips in drafts.
            </>
          )}
        </p>
        <div
          className={`progress ${styles.bar}`}
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          {/* A sliver is always drawn, so that a nearly empty bar still reads as a bar. */}
          <span style={{ width: `${Math.max(percent, 1)}%` }} />
        </div>
      </div>
    </div>
  )
}
