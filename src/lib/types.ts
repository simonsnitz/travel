/** Calendar date in the form YYYY-MM-DD (no time, no timezone). */
export type ISODate = string

export interface Photo {
  /** Storage path of the full-size image. Turn it into a URL with `store.mediaUrl()`. */
  path: string
  /** Storage path of the small version, for grids and tiles. */
  thumbPath: string
  /** Pixel size of the full-size image. */
  width: number
  height: number
  caption?: string
}

/** One or more paragraphs; a blank line separates paragraphs. */
export interface TextBlock {
  id: string
  type: 'text'
  text: string
}

/** One photo is shown large; several are shown as a grid. */
export interface PhotosBlock {
  id: string
  type: 'photos'
  photos: Photo[]
}

export type VideoBlock =
  /** A clip uploaded to storage. */
  | { id: string; type: 'video'; source: 'upload'; path: string; caption?: string }
  /** A YouTube or Vimeo link; see `parseVideoUrl()` in embed.ts. */
  | { id: string; type: 'video'; source: 'embed'; url: string; caption?: string }

export type Block = TextBlock | PhotosBlock | VideoBlock

export interface Trip {
  id: string
  /** URL segment, e.g. "india-nepal". */
  slug: string
  title: string
  startDate: ISODate
  endDate: ISODate
  cover: Photo | null
}

/** A day is identified by its trip and date; there is at most one per date. */
export interface DaySummary {
  tripId: string
  date: ISODate
  location: string
  published: boolean
}

export interface Day extends DaySummary {
  blocks: Block[]
  /** ISO timestamp of the last save. */
  updatedAt: string
}

export interface AdminUser {
  id: string
  email: string
}

/** Omit `id` to create a trip. */
export interface TripInput {
  id?: string
  slug: string
  title: string
  startDate: ISODate
  endDate: ISODate
  cover: Photo | null
}

export interface DayInput {
  tripId: string
  date: ISODate
  location: string
  blocks: Block[]
  published: boolean
}

/**
 * A fingerprint of what is published: how many days, and when the newest of
 * them was last saved. The backup copy records the same two values.
 */
export interface PublishedState {
  days: number
  /** ISO timestamp, or null when nothing is published. */
  latest: string | null
}
