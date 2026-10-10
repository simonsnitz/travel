import { PenLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dayNumber, formatDay, formatWeekday, today } from '../../lib/dates'
import type { Trip } from '../../lib/types'
import styles from './TodayLink.module.css'

/**
 * The way in to today's entry, shown only while the trip is under way. It is
 * what the owner reaches for most, so it is the biggest target on the page.
 */
export default function TodayLink({ trip }: { trip: Trip }) {
  const date = today()
  if (date < trip.startDate || date > trip.endDate) return null

  return (
    <Link className={`btn btn-primary ${styles.link}`} to={`/admin/trips/${trip.id}/days/${date}`}>
      <span className={styles.badge}>
        <PenLine aria-hidden size={20} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>Write today's entry</span>
        <span className={styles.meta}>
          Day {dayNumber(trip.startDate, date)} · {formatWeekday(date)}, {formatDay(date)}
        </span>
      </span>
    </Link>
  )
}
