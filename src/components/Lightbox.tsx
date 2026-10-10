import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import styles from './Lightbox.module.css'

export interface LightboxPhoto {
  /** URL of the full-size image. */
  src: string
  /** URL of a small version the browser already has, shown until the full image arrives. */
  placeholderSrc?: string
  /** Pixel size of the full-size image. */
  width: number
  height: number
  alt: string
  caption?: string
}

interface LightboxProps {
  photos: LightboxPhoto[]
  /** Which photo is showing. */
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

/** Distance in pixels a finger has to travel before a swipe changes the photo. */
const SWIPE_DISTANCE = 56

/**
 * Full-screen photo viewer. Rendering it opens it; the parent removes it again
 * in `onClose`. It moves between photos with the arrow keys, the on-screen
 * buttons, or a swipe, and hands focus back to whatever opened it.
 */
export default function Lightbox({ photos, index, onIndexChange, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  /** Horizontal distance the photo is being dragged by a finger, in pixels. */
  const [drag, setDrag] = useState(0)
  /** Which way the last move went, so the next photo can slide in from that side. */
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)

  const count = photos.length
  const photo = photos[index]
  const hasPrevious = index > 0
  const hasNext = index < count - 1

  function step(delta: -1 | 1): boolean {
    const next = index + delta
    if (next < 0 || next >= count) return false
    setDirection(delta)
    onIndexChange(next)
    return true
  }

  // The listeners below are attached once, so they reach the latest props through this ref.
  const latest = useRef({ step, onClose, hasPrevious, hasNext })
  latest.current = { step, onClose, hasPrevious, hasNext }

  // Open as a modal dialog: the browser then keeps focus and screen readers
  // inside it and makes the page behind inert.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const active = document.activeElement
    // In development React runs this effect twice; the second time focus is
    // already inside the dialog and must not replace the real opener.
    if (active instanceof HTMLElement && !dialog.contains(active)) openerRef.current = active
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal()
    closeRef.current?.focus()
    const unlockScroll = lockScroll()
    return () => {
      unlockScroll()
      // Without scrolling: the opener may be only partly on screen, and the page shouldn't jump on the way out.
      openerRef.current?.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Leave browser shortcuts such as Alt+Left (back) alone.
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.onClose()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        latest.current.step(-1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        latest.current.step(1)
      } else if (event.key === 'Tab') {
        keepFocusInside(dialogRef.current, event)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Swipes use native listeners because React's touch listeners are passive
  // and so can't stop the page behind from scrolling along.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    let start: { x: number; y: number } | null = null
    let horizontal: boolean | null = null
    let distance = 0

    // A reader who has pinched in is panning around the photo, not swiping.
    const zoomedIn = () => (window.visualViewport?.scale ?? 1) > 1.01

    function onTouchStart(event: TouchEvent) {
      const target = event.target
      const onControl = target instanceof Element && target.closest('button') !== null
      if (event.touches.length !== 1 || zoomedIn() || onControl) {
        // A second finger makes it a pinch: let go of the photo straight away.
        start = null
        setDrag(0)
        return
      }
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY }
      horizontal = null
      distance = 0
    }

    function onTouchMove(event: TouchEvent) {
      if (!start) return
      if (event.touches.length !== 1) {
        // A second finger turned this into a pinch.
        start = null
        setDrag(0)
        return
      }
      if (event.cancelable) event.preventDefault()
      const dx = event.touches[0].clientX - start.x
      const dy = event.touches[0].clientY - start.y
      if (horizontal === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        horizontal = Math.abs(dx) > Math.abs(dy)
      }
      if (!horizontal) return
      distance = dx
      const { hasPrevious, hasNext } = latest.current
      const blocked = dx > 0 ? !hasPrevious : !hasNext
      // Dragging past the first or last photo moves it only a little, to show there is nothing there.
      setDrag(blocked ? dx / 4 : dx)
    }

    function onTouchEnd(event: TouchEvent) {
      const swiped = start !== null && horizontal === true && event.type === 'touchend'
      start = null
      setDrag(0)
      if (swiped && Math.abs(distance) >= SWIPE_DISTANCE) latest.current.step(distance < 0 ? 1 : -1)
    }

    dialog.addEventListener('touchstart', onTouchStart, { passive: true })
    dialog.addEventListener('touchmove', onTouchMove, { passive: false })
    dialog.addEventListener('touchend', onTouchEnd)
    dialog.addEventListener('touchcancel', onTouchEnd)
    return () => {
      dialog.removeEventListener('touchstart', onTouchStart)
      dialog.removeEventListener('touchmove', onTouchMove)
      dialog.removeEventListener('touchend', onTouchEnd)
      dialog.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  if (!photo) return null

  // A click on the dark surround closes the viewer; one on the photo, a control or any of the text doesn't.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    // React passes events from a portal on to the component's ancestors, which have no use for these.
    event.stopPropagation()
    if (event.target instanceof Element && !event.target.closest('img, button, figcaption, p')) onClose()
  }

  const ratio = photo.width > 0 && photo.height > 0 ? photo.width / photo.height : 1.5
  const imageStyle = {
    '--ratio': ratio,
    '--natural-width': photo.width > 0 ? `${photo.width}px` : '100%',
    backgroundImage: photo.placeholderSrc ? `url(${JSON.stringify(photo.placeholderSrc)})` : undefined,
  } as CSSProperties
  const entrance = direction === 1 ? styles.fromRight : direction === -1 ? styles.fromLeft : styles.appear

  return createPortal(
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label="Photos"
      onClick={handleClick}
      // Escape and the Android back button arrive here; closing goes through
      // the parent so that the dialog and its state can't disagree.
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      <div className={styles.bar}>
        {count > 1 && (
          <div className={styles.pager}>
            <button
              type="button"
              className={`${styles.control} ${styles.previous}`}
              aria-label="Previous photo"
              aria-disabled={!hasPrevious}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <p className={styles.counter}>
              <span aria-hidden="true">
                {index + 1} / {count}
              </span>
              <span className="visually-hidden" aria-live="polite">
                Photo {index + 1} of {count}
              </span>
            </p>
            <button
              type="button"
              className={`${styles.control} ${styles.next}`}
              aria-label="Next photo"
              aria-disabled={!hasNext}
              onClick={() => step(1)}
            >
              <ChevronRight size={24} aria-hidden="true" />
            </button>
          </div>
        )}
        <button
          ref={closeRef}
          type="button"
          className={`${styles.control} ${styles.close}`}
          aria-label="Close"
          onClick={onClose}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>

      <figure className={styles.figure}>
        <div className={styles.stage}>
          <span className={`spinner ${styles.wait}`} aria-hidden="true" />
          <div
            key={index}
            className={`${styles.slide} ${entrance}`}
            data-dragging={drag !== 0 || undefined}
            style={drag !== 0 ? { transform: `translateX(${drag}px)` } : undefined}
          >
            <img
              className={styles.image}
              src={photo.src || undefined}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              draggable={false}
              style={imageStyle}
            />
          </div>
        </div>
        {photo.caption && <figcaption className={styles.caption}>{photo.caption}</figcaption>}
      </figure>
    </dialog>,
    document.body,
  )
}

/** Stops the page behind from scrolling. Returns a function that undoes it. */
function lockScroll(): () => void {
  const { body, documentElement } = document
  const previous = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
  // Hiding the scrollbar widens the page; the padding keeps it from jumping sideways.
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth
  body.style.overflow = 'hidden'
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
  return () => {
    body.style.overflow = previous.overflow
    body.style.paddingRight = previous.paddingRight
  }
}

/** Makes Tab and Shift+Tab cycle through the dialog's controls instead of leaving it. */
function keepFocusInside(dialog: HTMLElement | null, event: KeyboardEvent): void {
  if (!dialog) return
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
  if (controls.length === 0) return
  const first = controls[0]
  const last = controls[controls.length - 1]
  const active = document.activeElement
  const outside = !dialog.contains(active)
  if (event.shiftKey ? active === first || outside : active === last || outside) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}
