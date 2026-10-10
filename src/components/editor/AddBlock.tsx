import { ImagePlus, Plus, Type, Video, X } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import FilePickerButton from './FilePickerButton'
import styles from './AddBlock.module.css'

interface AddBlockProps {
  onAddText(): void
  /** The photos block is created from the chosen files, so an empty one never appears. */
  onAddPhotos(files: File[]): void
  onAddVideo(): void
}

/** The three large buttons at the end of the day. */
export function AddBlockBar({ onAddText, onAddPhotos, onAddVideo, empty }: AddBlockProps & { empty: boolean }) {
  return (
    <div className={styles.bar}>
      {empty && <p className={styles.invite}>Start with a few words, some photos, or a video.</p>}
      <div className={styles.choices} role="group" aria-label="Add to the end of the day">
        <button type="button" className={styles.choice} onClick={onAddText}>
          <Type size={20} />
          Add text
        </button>
        <FilePickerButton className={styles.choice} accept="image/*" multiple onFiles={onAddPhotos}>
          <ImagePlus size={20} />
          Add photos
        </FilePickerButton>
        <button type="button" className={styles.choice} onClick={onAddVideo}>
          <Video size={20} />
          Add video
        </button>
      </div>
    </div>
  )
}

interface AddBlockGapProps extends AddBlockProps {
  open: boolean
  onToggle(open: boolean): void
}

/** The quiet "+" between two blocks, which opens into the same three choices. */
export function AddBlockGap({ open, onToggle, onAddText, onAddPhotos, onAddVideo }: AddBlockGapProps) {
  const toggle = useRef<HTMLButtonElement>(null)

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open || event.key !== 'Escape') return
    onToggle(false)
    toggle.current?.focus()
  }

  return (
    <div className={open ? `${styles.gap} ${styles.open}` : styles.gap} onKeyDown={onKeyDown}>
      <button
        ref={toggle}
        type="button"
        className={styles.plus}
        aria-label={open ? 'Cancel adding a block' : 'Add a block here'}
        aria-expanded={open}
        onClick={() => onToggle(!open)}
      >
        {open ? <X size={16} /> : <Plus size={16} />}
      </button>
      {open && (
        // Each choice closes the row again. For photos that happens only once
        // files have been chosen, so the picker's input is still there to report them.
        <div className={styles.picks} role="group" aria-label="Add a block here">
          <button
            type="button"
            className={`btn btn-sm ${styles.pick}`}
            onClick={() => {
              onToggle(false)
              onAddText()
            }}
          >
            <Type size={16} />
            Text
          </button>
          <FilePickerButton
            className={`btn btn-sm ${styles.pick}`}
            accept="image/*"
            multiple
            onFiles={(files) => {
              onToggle(false)
              onAddPhotos(files)
            }}
          >
            <ImagePlus size={16} />
            Photos
          </FilePickerButton>
          <button
            type="button"
            className={`btn btn-sm ${styles.pick}`}
            onClick={() => {
              onToggle(false)
              onAddVideo()
            }}
          >
            <Video size={16} />
            Video
          </button>
        </div>
      )}
    </div>
  )
}
