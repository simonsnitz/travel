import { Link, useParams } from 'react-router-dom'
import { backupKey, readBackup } from '../../components/editor/backup'
import DayEditor from '../../components/editor/DayEditor'
import { useCrumbs } from '../../lib/crumbs'
import { formatDay, isISODate } from '../../lib/dates'
import { store } from '../../lib/store'
import { useAsync } from '../../lib/useAsync'
import styles from './DayEditorPage.module.css'

/**
 * Admin page for writing one day of a trip: /admin/trips/:tripId/days/:date.
 * This part finds the trip and the day; the editing happens in <DayEditor>.
 */
export default function DayEditorPage() {
  const { tripId = '', date = '' } = useParams()
  const validDate = isISODate(date)

  const { data, error, loading, reload } = useAsync(async () => {
    if (!validDate) return null
    const [trip, day] = await Promise.all([store.getTripById(tripId), store.getDay(tripId, date)])
    return trip ? { trip, day } : null
  }, [tripId, date])

  useCrumbs(
    data
      ? [{ label: 'Admin', to: '/admin' }, { label: data.trip.title, to: `/admin/trips/${data.trip.id}` }, { label: formatDay(date) }]
      : [{ label: 'Admin', to: '/admin' }],
  )

  if (!validDate) return <Unavailable message="That isn't a valid date." />

  // Checked before `loading` and `error`: once the editor is on screen, nothing
  // about the loader may take it away again, or whatever was typed would go with it.
  if (data === undefined) {
    if (error && !loading) {
      return (
        <div className={`placeholder ${styles.notice}`} role="alert">
          <p>{error.message}</p>
          {/* After a dropped connection, the worry at this moment is whether the writing survived. */}
          {readBackup(backupKey(tripId, date)) && <p>Your unsaved changes are still on this device.</p>}
          <button type="button" className="btn btn-primary" onClick={reload}>
            Try again
          </button>
          <Link to="/admin">Back to admin</Link>
        </div>
      )
    }
    return (
      <div className="placeholder">
        <span className="spinner" role="status" aria-label="Loading" />
      </div>
    )
  }

  if (!data) return <Unavailable message="That trip doesn't exist." />

  // Keyed by day, so moving to the next day starts from a clean slate instead of inheriting this one's state.
  return <DayEditor key={`${data.trip.id}/${date}`} trip={data.trip} date={date} day={data.day} />
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className={`placeholder ${styles.notice}`}>
      <h1>Nothing to edit here</h1>
      <p>{message}</p>
      <Link className="btn btn-primary" to="/admin">
        Back to admin
      </Link>
    </div>
  )
}
