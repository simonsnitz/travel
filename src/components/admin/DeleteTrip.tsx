import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { store } from '../../lib/store'
import type { Trip } from '../../lib/types'
import { messageOf } from '../../lib/errors'
import InlineSpinner from './InlineSpinner'
import styles from './DeleteTrip.module.css'

interface DeleteTripProps {
  trip: Trip
  /** Called once the trip is gone. */
  onDeleted: () => void
}

/** Deletes the whole trip, after asking first. */
export default function DeleteTrip({ trip, onDeleted }: DeleteTripProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    if (deleting) return
    const confirmed = window.confirm(
      `Delete “${trip.title}”?\n\nThis deletes every day, photo, and video in the trip. It can't be undone.`,
    )
    if (!confirmed) return

    setError(null)
    setDeleting(true)
    try {
      await store.deleteTrip(trip.id)
    } catch (reason) {
      setError(messageOf(reason))
      return
    } finally {
      setDeleting(false)
    }
    onDeleted()
  }

  return (
    <div className={styles.zone}>
      <p className="muted">
        Deleting the trip also deletes every day, photo, and video in it. This can't be undone.
      </p>
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
      <button className={`btn btn-danger ${styles.delete}`} type="button" aria-disabled={deleting} onClick={remove}>
        {deleting ? (
          <>
            <InlineSpinner />
            Deleting…
          </>
        ) : (
          <>
            <Trash2 aria-hidden size={18} />
            Delete trip
          </>
        )}
      </button>
    </div>
  )
}
