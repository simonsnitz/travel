import { Eye, Mountain, PenLine, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import BackupStatus from '../../components/admin/BackupStatus'
import RetryBanner from '../../components/admin/RetryBanner'
import StorageUsage from '../../components/admin/StorageUsage'
import TodayLink from '../../components/admin/TodayLink'
import { useCrumbs } from '../../lib/crumbs'
import { formatRange } from '../../lib/dates'
import { store } from '../../lib/store'
import type { Trip } from '../../lib/types'
import { useAsync } from '../../lib/useAsync'
import styles from './AdminHomePage.module.css'

/** The admin's front page: every trip, and the way in to edit each one. */
export default function AdminHomePage() {
  useCrumbs([{ label: 'Admin' }])
  const { data: trips, error, reload } = useAsync(() => store.listTrips(), [])

  return (
    <div className={styles.column}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Your trips</h1>
        </div>
        <Link className="btn btn-primary" to="/admin/trips/new">
          <Plus aria-hidden size={18} />
          New trip
        </Link>
      </header>

      {error ? (
        <RetryBanner message={error.message} onRetry={reload} />
      ) : !trips ? (
        <div className="placeholder">
          <span className="spinner" role="status" aria-label="Loading trips" />
        </div>
      ) : trips.length === 0 ? (
        <div className={`card ${styles.empty}`}>
          <h2 className={styles.name}>No trips yet</h2>
          <p className="muted">Start one with “New trip” and it will show up here.</p>
        </div>
      ) : (
        <ul className={styles.list} role="list">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ul>
      )}

      <BackupStatus />
      <StorageUsage />
    </div>
  )
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <li className={`card ${styles.trip}`}>
      <div className={styles.thumb}>
        {trip.cover ? (
          <img src={store.mediaUrl(trip.cover.thumbPath)} alt="" loading="lazy" />
        ) : (
          <Mountain aria-hidden size={28} />
        )}
      </div>
      <div>
        <h2 className={styles.name}>{trip.title}</h2>
        <p className={`muted ${styles.dates}`}>{formatRange(trip.startDate, trip.endDate)}</p>
      </div>
      <div className={styles.actions}>
        <TodayLink trip={trip} />
        <Link className="btn" to={`/admin/trips/${trip.id}`} aria-label={`Edit ${trip.title}`}>
          <PenLine aria-hidden size={18} />
          Edit
        </Link>
        <Link className="btn btn-ghost" to={`/${trip.slug}`} aria-label={`View ${trip.title}`}>
          <Eye aria-hidden size={18} />
          View
        </Link>
      </div>
    </li>
  )
}
