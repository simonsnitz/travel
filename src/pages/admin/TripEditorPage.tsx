import { Eye } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import DayList from '../../components/admin/DayList'
import DeleteTrip from '../../components/admin/DeleteTrip'
import RetryBanner from '../../components/admin/RetryBanner'
import TodayLink from '../../components/admin/TodayLink'
import TripForm from '../../components/admin/TripForm'
import { useCrumbs } from '../../lib/crumbs'
import { formatRange } from '../../lib/dates'
import { store } from '../../lib/store'
import type { Trip } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import styles from './TripEditorPage.module.css'

/** Creates a trip (/admin/trips/new) or edits one: its details, its days, and deleting it. */
export default function TripEditorPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()

  // The router keeps this page mounted when only the trip in the address
  // changes, so the editor is given a new key, and so a clean slate, for each
  // trip. The one exception is a new trip taking its permanent address once it
  // has been created: starting over there would rebuild the form the owner has
  // just saved, and lose the confirmation along with it.
  const [session, setSession] = useState({ tripId, key: 0 })
  if (session.tripId !== tripId) {
    setSession({ tripId, key: session.tripId === undefined ? session.key : session.key + 1 })
  }

  return (
    <TripEditor
      key={session.key}
      tripId={tripId}
      onCreated={(trip) => navigate(`/admin/trips/${trip.id}`, { replace: true })}
      onDeleted={() => navigate('/admin', { replace: true })}
    />
  )
}

interface TripEditorProps {
  /** Undefined for a trip that hasn't been created yet. */
  tripId: string | undefined
  onCreated: (trip: Trip) => void
  onDeleted: () => void
}

function TripEditor({ tripId, onCreated, onDeleted }: TripEditorProps) {
  const id = useId()
  // The trip as last saved here. It is newer than anything loaded, and for a
  // trip created on this screen it is all there is, so it is never loaded again.
  const [saved, setSaved] = useState<Trip | null>(null)
  const { data, loading, error, reload } = useAsync(
    () => (tripId && !saved ? store.getTripById(tripId) : Promise.resolve(null)),
    [tripId],
  )
  const trip = saved ?? data ?? null
  useCrumbs([{ label: 'Admin', to: '/admin' }, { label: trip?.title ?? (tripId ? 'Trip' : 'New trip') }])

  // A save or a delete can finish after the owner has moved on to another
  // page. Navigating then would pull them away from whatever they are doing.
  const onScreen = useRef(false)
  useEffect(() => {
    onScreen.current = true
    return () => {
      onScreen.current = false
    }
  }, [])

  function handleSaved(next: Trip) {
    if (!onScreen.current) return
    setSaved(next)
    if (!trip) onCreated(next)
  }

  function handleDeleted() {
    if (onScreen.current) onDeleted()
  }

  if (tripId && !trip) {
    if (error) {
      return (
        <div className={styles.column}>
          <RetryBanner message={error.message} onRetry={reload} />
          <div>
            <Link className="btn btn-ghost" to="/admin">
              Back to admin
            </Link>
          </div>
        </div>
      )
    }
    if (loading) {
      return (
        <div className="placeholder">
          <span className="spinner" role="status" aria-label="Loading trip" />
        </div>
      )
    }
    return (
      <div className="placeholder">
        <h1>Trip not found</h1>
        <p>There is no trip at this address. It may have been deleted.</p>
        <Link className="btn btn-primary" to="/admin">
          Back to admin
        </Link>
      </div>
    )
  }

  return (
    <div className={styles.column}>
      <header className={styles.header}>
        <div className={styles.top}>
          <p className="eyebrow">Trip</p>
          {trip && (
            <Link className="btn" to={`/${trip.slug}`}>
              <Eye aria-hidden size={18} />
              View
            </Link>
          )}
        </div>
        <h1 className={styles.title}>{trip ? trip.title : 'New trip'}</h1>
        <p className="muted">
          {trip
            ? formatRange(trip.startDate, trip.endDate)
            : 'Give it a title and its dates. Days can be written once the trip is saved.'}
        </p>
      </header>

      {trip && <TodayLink trip={trip} />}

      <section className={styles.section} aria-labelledby={`${id}-details`}>
        <h2 id={`${id}-details`}>Trip details</h2>
        <TripForm trip={trip} onSaved={handleSaved} />
      </section>

      {trip && (
        <section className={styles.section} aria-labelledby={`${id}-days`}>
          <h2 id={`${id}-days`}>Days</h2>
          <DayList trip={trip} />
        </section>
      )}

      {trip && (
        <section className={`${styles.section} ${styles.danger}`} aria-labelledby={`${id}-danger`}>
          <h2 id={`${id}-danger`}>Danger zone</h2>
          <DeleteTrip trip={trip} onDeleted={handleDeleted} />
        </section>
      )}
    </div>
  )
}
