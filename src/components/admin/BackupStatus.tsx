import { CircleCheck, Clock, ExternalLink, TriangleAlert } from 'lucide-react'
import { backupCopy, store } from '../../lib/store'
import { useAsync } from '../../lib/useAsync'
import { backupStatus, fetchSchedule, WORKFLOW_PAGE } from './backupCheck'
import styles from './BackupStatus.module.css'

/**
 * A line on the admin's front page about the backup copy: the files published
 * beside the site that readers are served when the database can't be reached.
 * It stays quiet unless there is something to know, and says nothing at all if
 * it can't find out (or in the demo, which has no copy).
 */
export default function BackupStatus() {
  const { data: status } = useAsync(async () => {
    if (!backupCopy) return null
    const [live, copy, schedule] = await Promise.all([
      store.publishedState(),
      backupCopy.index().catch(() => null),
      fetchSchedule(),
    ])
    return backupStatus(live, copy, schedule)
  }, [])

  if (!status) return null

  if (status === 'off') {
    return (
      <div className={`banner ${styles.off}`} role="status">
        <TriangleAlert aria-hidden size={20} />
        <div>
          <p className={styles.lead}>Automatic backups are switched off</p>
          <p>
            GitHub pauses them after 60 days without changes to the site's code, so new entries aren't being copied. To
            turn them back on, open GitHub and choose “Enable workflow”.
          </p>
          <GitHubLink>Open GitHub</GitHubLink>
        </div>
      </div>
    )
  }

  return (
    <p className={styles.line} role="status">
      {status === 'current' ? (
        <>
          <CircleCheck aria-hidden size={18} className={styles.ok} />
          <span>Backup copy is up to date. If the database is ever unavailable, readers see this copy instead.</span>
        </>
      ) : (
        <>
          <Clock aria-hidden size={18} />
          <span>
            {status === 'missing'
              ? 'There is no backup copy yet. One is made automatically within a day.'
              : "The backup copy doesn't have your latest changes yet. It updates itself once a day."}{' '}
            <GitHubLink>Update it now</GitHubLink>
          </span>
        </>
      )}
    </p>
  )
}

function GitHubLink({ children }: { children: string }) {
  return (
    <a className={styles.link} href={WORKFLOW_PAGE} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink aria-hidden size={14} />
    </a>
  )
}
