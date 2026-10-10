import { formatBackupTime } from './backup'
import styles from './BackupBanner.module.css'

interface BackupBannerProps {
  /** When the unsaved changes were last edited, in milliseconds since the epoch. */
  editedAt: number
  onRestore(): void
  onDiscard(): void
}

/** Offers back the unsaved changes found on this device from an earlier visit. */
export default function BackupBanner({ editedAt, onRestore, onDiscard }: BackupBannerProps) {
  return (
    <div className={`banner ${styles.banner}`} role="alert">
      <p>You have unsaved changes from {formatBackupTime(editedAt)} on this device.</p>
      <div className={styles.actions}>
        <button type="button" className={`btn btn-primary ${styles.choice}`} onClick={onRestore}>
          Restore
        </button>
        <button type="button" className={`btn ${styles.choice}`} onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
