import { GITHUB_REPO } from '../../config'
import type { PublishedState } from '../../lib/types'

/**
 * What to tell the owner about the backup copy.
 *
 * - `current`: the copy holds everything that is published
 * - `behind`: something was published or changed since the last daily run
 * - `missing`: the site has no copy yet
 * - `off`: GitHub has stopped the daily run, so nothing new is being copied
 */
export type BackupStatus = 'current' | 'behind' | 'missing' | 'off'

/** Whether GitHub is still running the daily job. `unknown` when GitHub couldn't be asked. */
export type Schedule = 'active' | 'off' | 'unknown'

/** Where the owner starts the backup by hand, or switches the daily run back on. */
export const WORKFLOW_PAGE = `https://github.com/${GITHUB_REPO}/actions/workflows/deploy.yml`

export function backupStatus(live: PublishedState, copy: PublishedState | null, schedule: Schedule): BackupStatus {
  // Said first, whatever the copy holds: the owner is here to write, and what they write next won't be copied.
  if (schedule === 'off') return 'off'
  if (!copy) return 'missing'
  return copy.days === live.days && sameMoment(copy.latest, live.latest) ? 'current' : 'behind'
}

// The same instant can be spelled differently ("+00:00" or "Z"), so compare the moments, not the text.
function sameMoment(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return Date.parse(a) === Date.parse(b)
}

/**
 * Asks GitHub whether the daily job is still switched on. GitHub stops
 * scheduled jobs in a repository that has had no activity for 60 days, and it
 * takes a click from the owner to start them again. The repository is public,
 * so this needs no sign-in.
 */
export async function fetchSchedule(): Promise<Schedule> {
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/deploy.yml`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) return 'unknown'
    const workflow = (await response.json()) as { state?: unknown }
    return workflow.state === 'active' ? 'active' : 'off'
  } catch {
    return 'unknown'
  }
}
