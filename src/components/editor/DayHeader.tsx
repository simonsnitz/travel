import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { dayNumber, eachDate, formatDay, formatWeekday } from '../../lib/dates'
import type { ISODate, Trip } from '../../lib/types'
import styles from './DayHeader.module.css'

interface DayHeaderProps {
  trip: Trip
  date: ISODate
  /** 'new' until the day has been saved for the first time. */
  state: 'new' | 'draft' | 'published'
  /** Address of the day on the public site, when what is published matches the editor. */
  viewHref: string | null
  /** Called before following any link away from this day; call `preventDefault()` to stay. */
  onLeave(event: MouseEvent<HTMLAnchorElement>): void
}

const CHIPS = {
  new: { label: 'Not saved yet', className: 'chip' },
  draft: { label: 'Draft', className: 'chip chip-draft' },
  published: { label: 'Published', className: 'chip chip-published' },
} as const

/** "Day 8 · Wednesday", the date, and arrows to the days either side. */
export default function DayHeader({ trip, date, state, viewHref, onLeave }: DayHeaderProps) {
  const dates = eachDate(trip.startDate, trip.endDate)
  const index = dates.indexOf(date)
  // A day can fall outside the trip if the trip's dates were changed after it
  // was written. It can still be edited; it just has no number or neighbours.
  const inTrip = index !== -1
  const previous = inTrip ? dates[index - 1] : undefined
  const next = inTrip ? dates[index + 1] : undefined
  const weekday = formatWeekday(date)
  const chip = CHIPS[state]

  const arrow = (target: ISODate | undefined, direction: 'Previous' | 'Next') =>
    target ? (
      <Link
        className="btn btn-ghost btn-icon"
        to={`/admin/trips/${trip.id}/days/${target}`}
        aria-label={`${direction} day, ${formatDay(target)}`}
        onClick={onLeave}
      >
        {direction === 'Previous' ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </Link>
    ) : (
      // Keeps the title centred on the first and last day.
      <span className={styles.spacer} />
    )

  return (
    <header className={styles.header}>
      <div className={styles.nav}>
        {arrow(previous, 'Previous')}
        <div className={styles.title}>
          <p className="eyebrow">{inTrip ? `Day ${dayNumber(trip.startDate, date)} · ${weekday}` : weekday}</p>
          <h1 className={styles.date}>{formatDay(date)}</h1>
        </div>
        {arrow(next, 'Next')}
      </div>
      <div className={styles.meta}>
        <span className={chip.className}>{chip.label}</span>
        {!inTrip && <span className="hint">Outside this trip's dates</span>}
        {viewHref && (
          <Link className={styles.view} to={viewHref} onClick={onLeave}>
            View on site
          </Link>
        )}
      </div>
    </header>
  )
}
