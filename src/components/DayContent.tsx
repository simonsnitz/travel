import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react'
import { dayNumber, formatDay, formatWeekday, isISODate } from '../lib/dates'
import { parseVideoUrl } from '../lib/embed'
import { store } from '../lib/store'
import type { Block, ISODate, PhotosBlock, VideoBlock } from '../lib/types'
import Lightbox, { type LightboxPhoto } from './Lightbox'
import { blockHasContent, externalHref, photoAlt, splitParagraphs, tileShape } from './dayLayout'
import styles from './DayContent.module.css'

export interface DayContentProps {
  /** The trip's first date, used to show "Day N". */
  tripStart: ISODate
  day: { date: ISODate; location: string; blocks: Block[] }
}

/**
 * One day of the journal: its heading, then its blocks in order. Everything
 * comes from the props, so the editor can show a live preview with it.
 */
export default function DayContent({ tripStart, day }: DayContentProps) {
  const place = day.location.trim()
  /** Position, among all of the day's photos, of the one open in the lightbox. */
  const [openPhoto, setOpenPhoto] = useState<number | null>(null)

  // The lightbox pages through every photo of the day, so each photos block
  // needs to know where its own photos start in that sequence.
  const gallery = useMemo(() => {
    const photos: LightboxPhoto[] = []
    const offsets = day.blocks.map((block) => {
      const offset = photos.length
      if (block.type === 'photos') {
        const inGrid = block.photos.length > 1
        for (const photo of block.photos) {
          photos.push({
            src: store.mediaUrl(photo.path),
            // Only a grid has already fetched the small version.
            placeholderSrc: inGrid ? store.mediaUrl(photo.thumbPath) : undefined,
            width: photo.width,
            height: photo.height,
            alt: photoAlt(photo, place),
            caption: photo.caption?.trim() || undefined,
          })
        }
      }
      return offset
    })
    return { photos, offsets }
  }, [day.blocks, place])

  // The editor's preview can pass a date that is still being typed.
  const dated = isISODate(day.date)
  const number = dated && isISODate(tripStart) ? dayNumber(tripStart, day.date) : 0
  const weekday = dated ? formatWeekday(day.date) : ''
  const eyebrow = [number >= 1 ? `Day ${number}` : '', weekday].filter(Boolean).join(' · ')
  const date = dated ? formatDay(day.date) : ''

  return (
    <article className={styles.day}>
      <header className={styles.header}>
        {eyebrow && <p className={`eyebrow ${styles.eyebrow}`}>{eyebrow}</p>}
        {/* Focusable from script, so the page can move a keyboard or screen reader user here when the day changes. */}
        <h1 className={styles.title} tabIndex={-1}>
          {date}
          {date && place && (
            // The no-break space keeps the dot with the date, so a long place
            // name wraps onto its own line instead of starting one with the dot.
            <span className={styles.dot} aria-hidden="true">
              {'\u00a0· '}
            </span>
          )}
          {place}
          {!date && !place && 'Journal entry'}
        </h1>
      </header>

      {day.blocks.map((block, position) => {
        if (!blockHasContent(block)) return null
        if (block.type === 'text') return <Prose key={block.id} text={block.text} />
        if (block.type === 'photos') {
          const offset = gallery.offsets[position]
          return <Photos key={block.id} block={block} place={place} onOpen={(index) => setOpenPhoto(offset + index)} />
        }
        return <Video key={block.id} block={block} place={place} />
      })}

      {!day.blocks.some(blockHasContent) && <p className={styles.empty}>Nothing written for this day yet.</p>}

      {openPhoto !== null && openPhoto < gallery.photos.length && (
        <Lightbox
          photos={gallery.photos}
          index={openPhoto}
          onIndexChange={setOpenPhoto}
          onClose={() => setOpenPhoto(null)}
        />
      )}
    </article>
  )
}

function Prose({ text }: { text: string }) {
  return (
    <div className={styles.prose}>
      {splitParagraphs(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}

function Photos({ block, place, onOpen }: { block: PhotosBlock; place: string; onOpen: (index: number) => void }) {
  // The lightbox hands focus back to whatever had it when it opened. Safari,
  // and Firefox on a Mac, don't focus a button that is clicked, so do it here.
  const open = (index: number) => (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true })
    onOpen(index)
  }

  if (block.photos.length === 1) {
    const photo = block.photos[0]
    return (
      <figure className={styles.figure}>
        <button
          type="button"
          className={styles.photo}
          style={mediaBox(photo.width, photo.height)}
          aria-haspopup="dialog"
          onClick={open(0)}
        >
          <img
            src={store.mediaUrl(photo.path) || undefined}
            alt={photoAlt(photo, place)}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
          />
        </button>
        <Caption text={photo.caption} />
      </figure>
    )
  }

  return (
    <div className={styles.grid}>
      {block.photos.map((photo, index) => {
        const { lead, half } = tileShape(block.photos.length, index)
        return (
          <figure key={photo.path} className={classes(styles.cell, lead && styles.lead, half && styles.half)}>
            <button type="button" className={styles.tile} aria-haspopup="dialog" onClick={open(index)}>
              <img
                src={store.mediaUrl(photo.thumbPath) || undefined}
                alt={photoAlt(photo, place)}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
              />
            </button>
            <Caption text={photo.caption} />
          </figure>
        )
      })}
    </div>
  )
}

function Video({ block, place }: { block: VideoBlock; place: string }) {
  const label = block.caption?.trim() || (place ? `Video from ${place}` : 'Video')
  if (block.source === 'upload') return <Clip path={block.path} label={label} caption={block.caption} />

  const embed = parseVideoUrl(block.url)
  if (!embed) {
    const href = externalHref(block.url)
    return (
      <p className={styles.link}>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {block.url.trim()}
          </a>
        ) : (
          block.url.trim()
        )}
      </p>
    )
  }
  const vertical = embed.aspectRatio === '9 / 16'
  return (
    <figure className={styles.figure}>
      <div
        className={classes(styles.embed, vertical && styles.vertical)}
        style={{ '--ratio': embed.aspectRatio } as CSSProperties}
      >
        <iframe
          src={embed.embedUrl}
          title={label}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <Caption text={block.caption} />
    </figure>
  )
}

/** An uploaded clip. Its shape is unknown until the browser has read the file's header. */
function Clip({ path, label, caption }: { path: string; label: string; caption?: string }) {
  const [ratio, setRatio] = useState(16 / 9)
  const url = store.mediaUrl(path)
  return (
    <figure className={styles.figure}>
      <video
        className={styles.video}
        style={{ '--ratio': ratio } as CSSProperties}
        // Starting a hair after zero makes iOS show the first frame instead of a blank box.
        src={url ? `${url}#t=0.001` : undefined}
        aria-label={label}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget
          if (videoWidth > 0 && videoHeight > 0) setRatio(videoWidth / videoHeight)
        }}
      />
      <Caption text={caption} />
    </figure>
  )
}

function Caption({ text }: { text?: string }) {
  const caption = text?.trim()
  return caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null
}

/** Proportions for the stylesheet, which uses them to reserve a photo's space before it loads. */
function mediaBox(width: number, height: number): CSSProperties {
  const known = width > 0 && height > 0
  return { '--ratio': known ? width / height : 1.5, '--natural-width': known ? `${width}px` : '100%' } as CSSProperties
}

function classes(...names: (string | false)[]): string {
  return names.filter(Boolean).join(' ')
}
