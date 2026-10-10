import { Check } from 'lucide-react'
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import { useHref } from 'react-router-dom'
import { mediaFolder } from '../../lib/media'
import { store } from '../../lib/store'
import type { Photo, Trip, TripInput } from '../../lib/types'
import { slugify, tripProblem } from '../../lib/validate'
import CoverField from './CoverField'
import { messageOf } from '../../lib/errors'
import InlineSpinner from './InlineSpinner'
import { unusedPhotoPaths } from './unusedPhotoPaths'
import styles from './TripForm.module.css'

interface TripFormProps {
  /** The trip as it is stored, or null while one is being created. */
  trip: Trip | null
  /** Called with the stored trip after every successful save. */
  onSaved: (trip: Trip) => void
}

const WAIT_FOR_UPLOAD = 'Wait for the cover photo to finish uploading, then save.'

/** The trip's details: title, web address, dates, and cover photo. */
export default function TripForm({ trip, onSaved }: TripFormProps) {
  const id = useId()
  const addressBase = useAddressBase()
  const [title, setTitle] = useState(trip?.title ?? '')
  const [slug, setSlug] = useState(trip?.slug ?? '')
  // A new trip's address follows its title until the owner types one of their own.
  const [slugFollowsTitle, setSlugFollowsTitle] = useState(trip === null)
  const [startDate, setStartDate] = useState(trip?.startDate ?? '')
  const [endDate, setEndDate] = useState(trip?.endDate ?? '')
  const [cover, setCover] = useState<Photo | null>(trip?.cover ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [attempts, setAttempts] = useState(0)
  // Covers uploaded here and then replaced or removed without ever being saved.
  const discarded = useRef<Photo[]>([])
  // Set by any edit, so a save can tell whether the form changed while it was under way.
  const editedSinceSubmit = useRef(false)
  const result = useRef<HTMLDivElement>(null)

  const unsaved =
    trip !== null &&
    (title.trim() !== trip.title ||
      slug.trim() !== trip.slug ||
      startDate !== trip.startDate ||
      endDate !== trip.endDate ||
      cover?.path !== trip.cover?.path)

  // Saving with the keyboard's Go key, from a field near the top, would
  // otherwise leave the result of the save below the edge of the screen.
  useEffect(() => {
    if (saving || saved || problem) result.current?.scrollIntoView({ block: 'nearest' })
  }, [attempts, saving, saved, problem])

  /** Any edit makes the last save's result out of date. */
  function edited() {
    editedSinceSubmit.current = true
    setProblem(null)
    setSaved(false)
  }

  function changeTitle(value: string) {
    edited()
    setTitle(value)
    // An existing trip's address is never changed for the owner: links to it may already be shared.
    if (!trip && slugFollowsTitle) setSlug(slugify(value))
  }

  function changeSlug(value: string) {
    edited()
    setSlug(value)
    setSlugFollowsTitle(false)
  }

  function changeCover(next: Photo | null) {
    edited()
    if (cover && cover.path !== trip?.cover?.path) discarded.current.push(cover)
    setCover(next)
  }

  function changeUploading(next: boolean) {
    setUploading(next)
    // Once the upload is over, being told to wait for it no longer applies.
    if (!next) setProblem((current) => (current === WAIT_FOR_UPLOAD ? null : current))
  }

  /**
   * Removes cover files that the stored trip no longer uses. It runs only after
   * a save has succeeded, because until then the stored trip still points at
   * the old cover. A failure is ignored: the trip is saved either way, and the
   * worst outcome is a few unused files.
   */
  function deleteUnusedCovers(stored: Trip) {
    const candidates = trip?.cover ? [...discarded.current, trip.cover] : discarded.current
    discarded.current = []
    const paths = unusedPhotoPaths(candidates, stored.cover)
    if (paths.length === 0) return
    Promise.resolve()
      .then(() => store.deleteMedia(paths))
      .catch(() => {})
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setAttempts((count) => count + 1)
    setSaved(false)

    if (uploading) {
      setProblem(WAIT_FOR_UPLOAD)
      return
    }
    const input: TripInput = {
      ...(trip ? { id: trip.id } : {}),
      slug: slug.trim(),
      title: title.trim(),
      startDate,
      endDate,
      cover,
    }
    const invalid = tripProblem(input)
    if (invalid) {
      setProblem(invalid)
      return
    }

    setProblem(null)
    setSaving(true)
    editedSinceSubmit.current = false
    let stored: Trip
    try {
      stored = await store.saveTrip(input)
    } catch (reason) {
      setProblem(messageOf(reason))
      return
    } finally {
      setSaving(false)
    }
    deleteUnusedCovers(stored)
    // Anything typed while the save was under way is not part of it, so "Saved" would mislead.
    setSaved(!editedSinceSubmit.current)
    onSaved(stored)
  }

  return (
    // noValidate: tripProblem() does the checking, so its messages are the ones shown.
    <form className={`card ${styles.form}`} onSubmit={save} noValidate>
      <div className="field">
        <label className="label" htmlFor={`${id}-title`}>
          Title
        </label>
        <input
          className="input"
          id={`${id}-title`}
          value={title}
          required
          autoComplete="off"
          onChange={(event) => changeTitle(event.currentTarget.value)}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor={`${id}-slug`}>
          Web address
        </label>
        <input
          className="input"
          id={`${id}-slug`}
          value={slug}
          required
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-slug-hint`}
          onChange={(event) => changeSlug(event.currentTarget.value)}
        />
        <p className="hint" id={`${id}-slug-hint`}>
          Readers will find the trip at{' '}
          <span className={styles.address}>
            {addressBase}
            <strong>{slug.trim() || '…'}</strong>
          </span>
          {trip && <span className={styles.warning}>Changing it breaks links you have already shared.</span>}
        </p>
      </div>

      <div className={styles.dates}>
        <div className="field">
          <label className="label" htmlFor={`${id}-start`}>
            Start date
          </label>
          <input
            className={`input ${styles.date}`}
            id={`${id}-start`}
            type="date"
            value={startDate}
            required
            onChange={(event) => {
              edited()
              setStartDate(event.currentTarget.value)
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-end`}>
            End date
          </label>
          <input
            className={`input ${styles.date}`}
            id={`${id}-end`}
            type="date"
            value={endDate}
            min={startDate || undefined}
            required
            onChange={(event) => {
              edited()
              setEndDate(event.currentTarget.value)
            }}
          />
        </div>
      </div>

      <CoverField
        folder={trip ? mediaFolder(trip.id) : null}
        photo={cover}
        onChange={changeCover}
        onUploadingChange={changeUploading}
      />

      <div className={styles.result} ref={result}>
        {problem && (
          // Keyed by attempt so that a repeat of the same problem is announced again.
          <p className="banner banner-error" role="alert" key={attempts}>
            {problem}
          </p>
        )}
        <div className={styles.actions}>
          <button className={`btn btn-primary ${styles.save}`} type="submit" aria-disabled={saving}>
            {saving ? (
              <>
                <InlineSpinner />
                Saving…
              </>
            ) : trip ? (
              'Save changes'
            ) : (
              'Create trip'
            )}
          </button>
          <p className={saved ? `${styles.state} ${styles.saved}` : styles.state} role="status">
            {saved ? (
              <>
                <Check aria-hidden size={18} />
                Saved
              </>
            ) : (
              unsaved && !saving && 'Unsaved changes'
            )}
          </p>
        </div>
      </div>
    </form>
  )
}

/** A trip's public address without its slug or scheme, e.g. "example.com/travel/#/". */
function useAddressBase(): string {
  const home = new URL(useHref('/'), window.location.href)
  const base = `${home.host}${home.pathname}${home.search}${home.hash}`
  return base.endsWith('/') ? base : `${base}/`
}
