import { ChevronRight, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDay, formatWeekday, today } from '../../lib/dates'
import { store } from '../../lib/store'
import type { Trip } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import { dayRows, type DayRow } from './dayRows'
import RetryBanner from './RetryBanner'
import styles from './DayList.module.css'

/** Every date of the trip as a link to its day editor, with what has been written so far. */
export default function DayList({ trip }: { trip: Trip }) {
  const { data: days, error, reload } = useAsync(() => store.listDays(trip.id, { includeDrafts: true }), [trip.id])
  // The dates come from the trip itself, so each row is a working link before
  // the entries have loaded, and still is if they fail to.
  const rows = dayRows(trip, days ?? [])
  const outside = rows.filter((row) => row.number === null).length
  const now = today()

  return (
    <div className={styles.days}>
      <p className={`hint ${styles.hint}`} role="status">
        {days || error ? (
          'Choose a day to write or edit its entry.'
        ) : (
          <>
            <span className={`spinner ${styles.spinner}`} aria-hidden />
            Loading entries…
          </>
        )}
      </p>

      {error && <RetryBanner message={error.message} onRetry={reload} />}

      {outside > 0 && (
        <p className="banner">
          {outside === 1 ? '1 entry falls' : `${outside} entries fall`} outside the trip's dates. Nothing is lost:{' '}
          {outside === 1 ? 'it is' : 'they are'} listed below, marked “Outside trip dates”.
        </p>
      )}

      {rows.length > 0 && (
        <ol className={`card ${styles.list}`} role="list">
          {rows.map((row) => (
            <li key={row.date}>
              <DayLink tripId={trip.id} row={row} isToday={row.date === now} loaded={days !== undefined} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

interface DayLinkProps {
  tripId: string
  row: DayRow
  isToday: boolean
  /** False until the entries are known, when there is no status to show yet. */
  loaded: boolean
}

function DayLink({ tripId, row, isToday, loaded }: DayLinkProps) {
  const { entry } = row
  return (
    <Link
      className={isToday ? `${styles.row} ${styles.today}` : styles.row}
      to={`/admin/trips/${tripId}/days/${row.date}`}
      aria-current={isToday ? 'date' : undefined}
    >
      <span className={styles.number}>
        {row.number === null ? (
          <span aria-hidden>–</span>
        ) : (
          <>
            <span className={styles.numberLabel}>Day</span> {row.number}
          </>
        )}
      </span>

      <span className={styles.body}>
        <span className={styles.when}>
          <span className={styles.date}>{formatDay(row.date)}</span>
          <span className={styles.weekday}>{formatWeekday(row.date)}</span>
          {isToday && <span className={`chip ${styles.todayTag}`}>Today</span>}
        </span>
        {loaded && (
          <span className={styles.what}>
            {!entry ? (
              <span className={`muted ${styles.empty}`}>Empty</span>
            ) : entry.published ? (
              <span className="chip chip-published">Published</span>
            ) : (
              <span className="chip chip-draft">Draft</span>
            )}
            {entry?.location && <span className={styles.place}>{entry.location}</span>}
            {row.number === null && (
              <span className={styles.outside}>
                <TriangleAlert aria-hidden size={14} />
                Outside trip dates
              </span>
            )}
          </span>
        )}
      </span>

      <ChevronRight className={styles.chevron} aria-hidden size={18} />
    </Link>
  )
}
