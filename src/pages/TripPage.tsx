import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Pencil } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import DayContent from '../components/DayContent'
import { LoadError, Loading } from '../components/PageStatus'
import TripSidebar from '../components/TripSidebar'
import { adjacentDays, defaultDate } from '../components/tripDays'
import { useAuth } from '../lib/auth'
import { useCrumbs, type Crumb } from '../lib/crumbs'
import { formatDay, formatRange, isISODate } from '../lib/dates'
import { reader } from '../lib/store'
import type { DaySummary, Trip } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import NotFoundPage from './NotFoundPage'
import styles from './TripPage.module.css'

/** A trip, opened at one of its days: /:tripSlug or /:tripSlug/:date. */
export default function TripPage() {
  const { tripSlug = '', date } = useParams()
  const { data: trip, error, reload } = useAsync(() => reader.getTrip(tripSlug), [tripSlug])

  if (error) {
    return (
      <main>
        <LoadError error={error} onRetry={reload} />
      </main>
    )
  }
  if (trip === undefined) {
    return (
      <main>
        <Loading label="Loading trip" />
      </main>
    )
  }
  if (trip === null) return <NotFoundPage message="There's no trip at this address." />
  // Keyed so that nothing from one trip lingers when the address changes to another.
  return <TripView key={trip.id} trip={trip} date={date} />
}

function TripView({ trip, date }: { trip: Trip; date: string | undefined }) {
  const { data: days, error, reload } = useAsync(() => reader.listDays(trip.id), [trip.id])
  // A trip with nothing published gets a note instead of the usual layout, but
  // only at the trip's own address. An address that names a day is still looked
  // up: that day may have been published after the list was loaded.
  const nothingPosted = days?.length === 0 && date === undefined
  // An address without a date opens the default day at once, while <Navigate>
  // below brings the address into line.
  const fallback = date === undefined && days ? defaultDate(trip, days) : undefined
  const selected = date ?? fallback

  useCrumbs(trail(trip, selected))

  // Hash navigation keeps the scroll position, which would open a new day halfway down.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [selected])

  // "Check back soon" has to hold when the reader does: a phone often brings a
  // tab back just as it was left, without loading the page again.
  useEffect(() => {
    if (!nothingPosted) return
    const check = () => {
      if (document.visibilityState === 'visible') reload()
    }
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [nothingPosted, reload])

  if (nothingPosted) {
    return (
      <main className={styles.unwritten}>
        <h1>{trip.title}</h1>
        <p>{formatRange(trip.startDate, trip.endDate)}</p>
        <p>Nothing posted yet. Check back soon.</p>
      </main>
    )
  }

  return (
    <div className={styles.layout}>
      {fallback && <Navigate replace to={`/${trip.slug}/${fallback}`} />}
      {/* The list stays in place while a day loads, so moving between days only changes the entry. */}
      <TripSidebar trip={trip} days={days} current={selected} onRetry={error ? reload : undefined} />
      <main className={styles.main}>
        {selected ? (
          // Shown even if the list failed to load: the day in the address doesn't depend on it.
          <DayView trip={trip} days={days} date={selected} onUnlisted={reload} />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : (
          <Loading label="Loading days" />
        )}
      </main>
    </div>
  )
}

interface DayViewProps {
  trip: Trip
  /** Undefined while the list loads, or if it failed to; the day itself is fetched alongside it. */
  days: DaySummary[] | undefined
  /** Straight from the address, so it may not be a date at all. */
  date: string
  /** Called when a published day turns out to be missing from `days`. */
  onUnlisted: () => void
}

function DayView({ trip, days, date, onUnlisted }: DayViewProps) {
  const { user } = useAuth()
  const valid = isISODate(date)
  const { data, error, reload } = useAsync(
    () => (valid ? reader.getDay(trip.id, date) : Promise.resolve(null)),
    [trip.id, date],
  )
  // A signed-in owner is also handed drafts. The public page shows them to no one.
  const entry = data?.published ? data : null
  const failed = error !== null
  const settled = !valid || data !== undefined || failed

  // The list was loaded when the page opened. If a day has been published
  // since, as happens when a reader follows a fresh link in a tab that is
  // already open, fetch the list again so the new day appears in it too.
  const unlisted = entry !== null && days !== undefined && !days.some((day) => day.date === entry.date)
  useEffect(() => {
    if (unlisted) onUnlisted()
  }, [unlisted, onUnlisted])

  // When the reader moves from one day to another, put keyboard and screen
  // reader focus on the new heading. Otherwise it would stay on the link that
  // was used, with the changed entry going unannounced. The same goes for a day
  // that loads after "Try again", whose button has just disappeared. Arriving
  // on the page doesn't count as a move.
  const contentRef = useRef<HTMLDivElement>(null)
  const shown = useRef<{ date: string; failed: boolean } | null>(null)
  useEffect(() => {
    if (!settled) return
    const previous = shown.current
    shown.current = { date, failed }
    if (previous && !failed && (previous.date !== date || previous.failed)) {
      contentRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
    }
  }, [date, settled, failed])

  const { previous, next } = adjacentDays(days ?? [], date)

  return (
    <>
      {user && valid && (
        <p className={styles.edit}>
          <Link className="btn btn-sm" to={`/admin/trips/${trip.id}/days/${date}`}>
            <Pencil size={14} aria-hidden="true" />
            Edit this day
          </Link>
        </p>
      )}

      <div ref={contentRef} className={styles.content}>
        {!valid ? (
          <NoEntry tripIsEmpty={days?.length === 0} />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : data === undefined ? (
          <Loading label="Loading the day" />
        ) : entry ? (
          <DayContent key={entry.date} tripStart={trip.startDate} day={entry} />
        ) : (
          <NoEntry draft={data !== null} tripIsEmpty={days?.length === 0} />
        )}
      </div>

      {(previous || next) && (
        <nav className={styles.pager} aria-label="Previous and next day">
          {previous && <PagerLink trip={trip} day={previous} />}
          {next && <PagerLink trip={trip} day={next} forward />}
        </nav>
      )}
    </>
  )
}

function NoEntry({ draft = false, tripIsEmpty = false }: { draft?: boolean; tripIsEmpty?: boolean }) {
  return (
    <div className={styles.missing}>
      <h1 tabIndex={-1}>No entry for that day</h1>
      <p>
        {draft
          ? "This day is saved as a draft, so readers can't see it yet."
          : tripIsEmpty
            ? 'Nothing posted yet. Check back soon.'
            : 'Choose another day from the list.'}
      </p>
    </div>
  )
}

function PagerLink({ trip, day, forward = false }: { trip: Trip; day: DaySummary; forward?: boolean }) {
  return (
    <Link
      to={`/${trip.slug}/${day.date}`}
      className={`card ${styles.step} ${forward ? styles.forward : ''}`}
      rel={forward ? 'next' : 'prev'}
    >
      <span className={styles.stepLabel}>
        {!forward && <ArrowLeft size={15} aria-hidden="true" />}
        {forward ? 'Next' : 'Previous'}
        {forward && <ArrowRight size={15} aria-hidden="true" />}
      </span>{' '}
      <span className={styles.stepDate}>{formatDay(day.date)}</span>{' '}
      {day.location && <span className={styles.stepPlace}>{day.location}</span>}
    </Link>
  )
}

/** The navbar's trail: the trip, then the day being read. */
function trail(trip: Trip, date: string | undefined): Crumb[] {
  if (date === undefined) return [{ label: trip.title }]
  return [{ label: trip.title, to: `/${trip.slug}` }, { label: isISODate(date) ? formatDay(date) : 'No entry' }]
}
