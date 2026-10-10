import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { dayNumber, formatDayShort, formatRange } from '../lib/dates'
import type { DaySummary, Trip } from '../lib/types'
import styles from './TripSidebar.module.css'

interface TripSidebarProps {
  trip: Trip
  /** The trip's published days in date order. Undefined while they load, and after a failed load. */
  days: DaySummary[] | undefined
  /** Date of the day being read, if there is one. */
  current?: string
  /** Pass this when the list failed to load; it is offered as a way to try again. */
  onRetry?: () => void
}

/**
 * The trip's name and its list of days. On a wide screen it is a column that
 * stays put beside the entry; on a phone it is a strip of chips above it.
 */
export default function TripSidebar({ trip, days, current, onRetry }: TripSidebarProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const placed = useRef(false)

  // Bring the current day to the middle of the list, which scrolls sideways on
  // a phone and up and down on a wide screen. Only the list itself is scrolled,
  // never the page. Before the first paint it jumps; after that it glides.
  useLayoutEffect(() => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('[aria-current]')
    if (!list || !item) return
    const frame = list.getBoundingClientRect()
    const box = item.getBoundingClientRect()
    const glide = placed.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    list.scrollTo({
      left: list.scrollLeft + box.left - frame.left - (frame.width - box.width) / 2,
      top: list.scrollTop + box.top - frame.top - (frame.height - box.height) / 2,
      behavior: glide ? 'smooth' : 'auto',
    })
    placed.current = true
  }, [current, days])

  return (
    <aside className={styles.sidebar} aria-label={trip.title}>
      <div className={styles.head}>
        <p className={styles.trip}>{trip.title}</p>
        <p className={styles.dates}>{formatRange(trip.startDate, trip.endDate)}</p>
      </div>

      {days && days.length > 0 && (
        <nav className={styles.nav} aria-label="Days">
          <ol ref={listRef} className={styles.days}>
            {days.map((day) => {
              const number = dayNumber(trip.startDate, day.date)
              return (
                <li key={day.date}>
                  <Link
                    to={`/${trip.slug}/${day.date}`}
                    className={styles.day}
                    aria-current={day.date === current ? 'page' : undefined}
                  >
                    {/* An entry dated before the trip's first day has no day number to show. */}
                    <span className={styles.number}>
                      {number >= 1 && <span className="visually-hidden">Day </span>}
                      {number >= 1 ? number : '–'}
                    </span>{' '}
                    <span className={styles.text}>
                      <span className={styles.when}>{formatDayShort(day.date)}</span>{' '}
                      {day.location && <span className={styles.where}>{day.location}</span>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </nav>
      )}

      {!days && onRetry && (
        <p className={styles.note} role="alert">
          The list of days didn't load.
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            Try again
          </button>
        </p>
      )}

      {!days && !onRetry && (
        <p className={styles.note}>
          <span className="spinner" role="status" aria-label="Loading days" />
        </p>
      )}
    </aside>
  )
}
