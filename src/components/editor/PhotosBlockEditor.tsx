import { ArrowDown, ArrowUp, ImageOff, ImagePlus, RotateCcw } from 'lucide-react'
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { store } from '../../lib/store'
import type { Photo, PhotosBlock } from '../../lib/types'
import FilePickerButton from './FilePickerButton'
import { blurOnEnter } from './keys'
import type { PendingUpload } from './reducer'
import type { BlockActions } from './useDayEditor'
import styles from './PhotosBlockEditor.module.css'

interface PhotosBlockEditorProps {
  block: PhotosBlock
  /** Uploads still on their way into this block, or failed and waiting to be retried. */
  uploads: PendingUpload[]
  actions: BlockActions
}

function Thumb({ src, alt, busy = false, onMissing }: { src: string; alt: string; busy?: boolean; onMissing?(): void }) {
  const [broken, setBroken] = useState(false)
  // A restored backup can point at a file that was never stored or has since
  // been cleaned up. That must look like a gap, not break the editor.
  const missing = !src || broken
  return (
    <div className={styles.thumb}>
      {missing ? (
        <ImageOff size={22} />
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => {
            setBroken(true)
            onMissing?.()
          }}
        />
      )}
      {busy && (
        <span className={styles.veil}>
          <span className="spinner" />
        </span>
      )}
    </div>
  )
}

interface PhotoRowProps {
  photo: Photo
  /** 1 for the first photo in the block. */
  number: number
  count: number
  onCaption(path: string, caption: string): void
  onMove(path: string, delta: -1 | 1): void
  onRemove(path: string): void
}

function PhotoRow({ photo, number, count, onCaption, onMove, onRemove }: PhotoRowProps) {
  const src = store.mediaUrl(photo.thumbPath)
  const [missing, setMissing] = useState(!src)
  return (
    <li className={styles.row} data-photo={photo.path}>
      <Thumb src={src} alt={`Photo ${number}`} onMissing={() => setMissing(true)} />
      <div className={styles.detail}>
        <input
          className="input"
          type="text"
          value={photo.caption ?? ''}
          placeholder="Add a caption"
          aria-label={`Caption for photo ${number}`}
          enterKeyHint="done"
          onKeyDown={blurOnEnter}
          onChange={(event) => onCaption(photo.path, event.target.value)}
        />
        {missing && <p className="hint">This photo's file didn't load. If it stays that way, remove it and add it again.</p>}
        <div className={styles.tools}>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${styles.tool}`}
            aria-label={`Move photo ${number} earlier`}
            data-photo-move="earlier"
            disabled={number <= 1}
            onClick={() => onMove(photo.path, -1)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${styles.tool}`}
            aria-label={`Move photo ${number} later`}
            data-photo-move="later"
            disabled={number >= count}
            onClick={() => onMove(photo.path, 1)}
          >
            <ArrowDown size={18} />
          </button>
          <button
            type="button"
            className={`btn btn-danger ${styles.word} ${styles.remove}`}
            aria-label={`Remove photo ${number}`}
            onClick={() => onRemove(photo.path)}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}

function PendingRow({ upload, actions }: { upload: PendingUpload; actions: BlockActions }) {
  const failed = upload.status === 'failed'
  return (
    <li className={styles.row}>
      <Thumb src={upload.previewUrl} alt="" busy={!failed} />
      <div className={styles.detail}>
        <p className={styles.name}>{upload.name}</p>
        {failed ? (
          <>
            <p className={styles.error} role="alert">
              {upload.error}
            </p>
            <div className={styles.tools}>
              <button type="button" className={`btn ${styles.word}`} onClick={() => actions.retryUpload(upload.id)}>
                <RotateCcw size={16} />
                Retry
              </button>
              <button type="button" className={`btn btn-ghost ${styles.word}`} onClick={() => actions.dropUpload(upload.id)}>
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className={styles.tools}>
            <span className="hint">{upload.status === 'queued' ? 'Waiting to upload…' : 'Uploading…'}</span>
            {/* Also the way out if the connection dies and the upload never settles. */}
            <button
              type="button"
              className={`btn btn-ghost ${styles.word} ${styles.remove}`}
              aria-label={`Cancel uploading ${upload.name}`}
              onClick={() => actions.dropUpload(upload.id)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function PhotosBlockEditor({ block, uploads, actions }: PhotosBlockEditorProps) {
  const list = useRef<HTMLUListElement>(null)
  /** The move button to put focus back on once the list has been reordered. */
  const refocus = useRef<{ path: string; direction: 'earlier' | 'later' } | null>(null)

  // Reordering moves the row in the document, which drops keyboard focus.
  useLayoutEffect(() => {
    const request = refocus.current
    refocus.current = null
    if (!request || !list.current) return
    const row = Array.from(list.current.querySelectorAll<HTMLElement>('[data-photo]')).find(
      (element) => element.dataset.photo === request.path,
    )
    // At either end the button just used is disabled, so fall back to its partner.
    const directions = request.direction === 'earlier' ? ['earlier', 'later'] : ['later', 'earlier']
    for (const direction of directions) {
      const button = row?.querySelector<HTMLButtonElement>(`[data-photo-move="${direction}"]`)
      if (button && !button.disabled) {
        button.focus()
        break
      }
    }
  })

  const move = (path: string, delta: -1 | 1) => {
    refocus.current = { path, direction: delta === -1 ? 'earlier' : 'later' }
    actions.movePhoto(block.id, path, delta)
  }

  const count = block.photos.length
  const failed = uploads.filter((upload) => upload.status === 'failed')
  return (
    <div className={styles.photos}>
      <ul ref={list} className={styles.list}>
        {block.photos.map((photo, index) => (
          <PhotoRow
            key={photo.path}
            photo={photo}
            number={index + 1}
            count={count}
            onCaption={(path, caption) => actions.setPhotoCaption(block.id, path, caption)}
            onMove={move}
            onRemove={(path) => actions.removePhoto(block.id, path)}
          />
        ))}
        {uploads.map((upload) => (
          <PendingRow key={upload.id} upload={upload} actions={actions} />
        ))}
      </ul>
      <div className={styles.footer}>
        <FilePickerButton className={`btn ${styles.word}`} accept="image/*" multiple onFiles={(files) => actions.addPhotos(block.id, files)}>
          <ImagePlus size={16} />
          Add more
        </FilePickerButton>
        {/* After a dropped connection every photo in a batch fails at once. */}
        {failed.length > 1 && (
          <button type="button" className={`btn ${styles.word}`} onClick={() => failed.forEach((upload) => actions.retryUpload(upload.id))}>
            <RotateCcw size={16} />
            Retry all
          </button>
        )}
        <p className="hint">{count + uploads.length === 1 ? 'One photo is shown large.' : 'Several photos are shown as a grid.'}</p>
      </div>
    </div>
  )
}

export default memo(PhotosBlockEditor)
