import { ImagePlus, Trash2 } from 'lucide-react'
import { useId, useState, type ChangeEvent } from 'react'
import { store } from '../../lib/store'
import type { Photo } from '../../lib/types'
import { messageOf } from '../../lib/errors'
import InlineSpinner from './InlineSpinner'
import styles from './CoverField.module.css'

interface CoverFieldProps {
  /** Storage folder for uploads, or null while the trip has no id to file them under. */
  folder: string | null
  photo: Photo | null
  onChange: (photo: Photo | null) => void
  /** Told when an upload starts and when it ends, so the form can hold a save until then. */
  onUploadingChange: (uploading: boolean) => void
}

/** The trip's optional cover photo: choose one, see it, replace it, remove it. */
export default function CoverField({ folder, photo, onChange, onUploadingChange }: CoverFieldProps) {
  const id = useId()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Emptied so that choosing the same file again still counts as a change.
    input.value = ''
    if (!file || !folder || uploading) return

    setError(null)
    setUploading(true)
    onUploadingChange(true)
    try {
      onChange(await store.uploadPhoto(file, folder))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setUploading(false)
      onUploadingChange(false)
    }
  }

  function remove() {
    setError(null)
    onChange(null)
  }

  return (
    <div className={styles.cover} role="group" aria-labelledby={`${id}-label`}>
      <span className="label" id={`${id}-label`}>
        Cover photo (optional)
      </span>

      {photo && (
        <img
          className={styles.preview}
          src={store.mediaUrl(photo.thumbPath)}
          width={photo.width}
          height={photo.height}
          alt="Current cover photo"
        />
      )}

      <div className="row">
        <input
          className={`visually-hidden ${styles.file}`}
          id={`${id}-file`}
          type="file"
          accept="image/*"
          disabled={!folder || uploading}
          aria-describedby={folder ? undefined : `${id}-hint`}
          onChange={upload}
        />
        <label className={`btn ${styles.choose}`} htmlFor={`${id}-file`}>
          {uploading ? (
            <>
              <InlineSpinner />
              Uploading…
            </>
          ) : (
            <>
              <ImagePlus aria-hidden size={18} />
              {photo ? 'Replace' : 'Choose a photo'}
            </>
          )}
        </label>
        {photo && (
          <button className="btn btn-danger" type="button" disabled={uploading} onClick={remove}>
            <Trash2 aria-hidden size={18} />
            Remove
          </button>
        )}
      </div>

      {!folder && (
        <p className="hint" id={`${id}-hint`}>
          Save the trip first to add a cover photo.
        </p>
      )}
      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
