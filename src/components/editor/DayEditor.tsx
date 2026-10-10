import { Eye, MapPin, PenLine, Trash2 } from 'lucide-react'
import { useId, useMemo, useState, type MouseEvent } from 'react'
import type { Day, ISODate, Trip } from '../../lib/types'
import DayContent from '../DayContent'
import ActionBar from './ActionBar'
import BackupBanner from './BackupBanner'
import BlockList from './BlockList'
import { snapshotOf } from './blocks'
import DayHeader from './DayHeader'
import { blurOnEnter } from './keys'
import Segmented from './Segmented'
import { useDayEditor } from './useDayEditor'
import styles from './DayEditor.module.css'

interface DayEditorProps {
  trip: Trip
  date: ISODate
  /** The day as the server has it, or null if nothing has been saved for this date yet. */
  day: Day | null
}

type View = 'edit' | 'preview'

const VIEWS = [
  { value: 'edit', label: 'Edit', icon: <PenLine size={16} /> },
  { value: 'preview', label: 'Preview', icon: <Eye size={16} /> },
] as const

/**
 * The editor for one day. It starts from `day` and keeps its own state from
 * then on, so give it a `key` that changes with the trip and the date.
 */
export default function DayEditor({ trip, date, day }: DayEditorProps) {
  const editor = useDayEditor(trip, date, day)
  const { state, dirty, uploading, pendingBackup, actions } = editor
  const [view, setView] = useState<View>('edit')
  const locationId = useId()

  const exists = state.saved !== null
  const locked = pendingBackup !== null
  // Nothing may change while the day is being deleted, or before the owner has
  // chosen between the server's version and the one found on this device.
  const frozen = locked || state.status.kind === 'deleting'
  const saving = state.status.kind === 'saving'
  // What would be saved right now, which is also what a reader would see.
  const preview = useMemo(
    () => (view === 'preview' ? snapshotOf(state.location, state.blocks) : null),
    [view, state.location, state.blocks],
  )

  // The crumbs and the browser's back button can't be intercepted (the local
  // backup covers those), but the editor's own links away from the day can ask first.
  const confirmLeave = (event: MouseEvent<HTMLAnchorElement>) => {
    const reason = uploading
      ? 'Uploads are still running and will be lost.'
      : dirty
        ? 'This day has unsaved changes. They stay on this device, but are not on the site yet.'
        : null
    if (reason && !window.confirm(`${reason} Leave anyway?`)) event.preventDefault()
  }

  return (
    <div className={styles.editor}>
      <DayHeader
        trip={trip}
        date={date}
        state={!exists ? 'new' : state.published ? 'published' : 'draft'}
        viewHref={state.published && !dirty && !locked ? `/${trip.slug}/${date}` : null}
        onLeave={confirmLeave}
      />

      {pendingBackup && (
        <BackupBanner editedAt={pendingBackup.editedAt} onRestore={editor.restoreBackup} onDiscard={editor.discardBackup} />
      )}

      <div className={frozen ? `${styles.sheet} ${styles.frozen}` : styles.sheet} inert={frozen}>
        <div className={styles.switch}>
          <Segmented<View> label="Edit or preview" name="day-view" value={view} options={VIEWS} onChange={setView} />
        </div>

        {preview ? (
          <div className={styles.preview}>
            <p className="hint">This is how the day will look on the site.</p>
            <DayContent tripStart={trip.startDate} day={{ date, location: preview.location, blocks: preview.blocks }} />
          </div>
        ) : (
          <>
            <div className={styles.location}>
              <MapPin size={18} />
              <label className="visually-hidden" htmlFor={locationId}>
                Location
              </label>
              <input
                id={locationId}
                className={`input ${styles.place}`}
                type="text"
                value={state.location}
                placeholder="Where were you?"
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={blurOnEnter}
                onChange={(event) => editor.setLocation(event.target.value)}
              />
            </div>

            <BlockList blocks={state.blocks} uploads={state.uploads} actions={actions} />

            {exists && (
              <div className={styles.danger}>
                <button type="button" className={`btn btn-danger ${styles.delete}`} disabled={saving} onClick={editor.deleteDay}>
                  <Trash2 size={16} />
                  Delete day
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ActionBar
        status={state.status}
        dirty={dirty}
        uploading={uploading}
        exists={exists}
        published={state.published}
        locked={locked}
        onSave={editor.save}
        onRetry={editor.retry}
      />
    </div>
  )
}
