import { createDemoStore } from './demoStore'
import { createReader } from './reader'
import { createSnapshot, type Snapshot } from './snapshot'
import { createSupabaseStore } from './supabaseStore'
import type {
  AdminUser,
  Day,
  DayInput,
  DaySummary,
  ISODate,
  Photo,
  PublishedState,
  StorageUsage,
  Trip,
  TripInput,
} from './types'

export interface ReadOptions {
  /**
   * Make one short attempt and reject at the first sign of trouble, instead of
   * retrying. For the public pages, which have the backup copy to fall back on
   * and so gain nothing from keeping a reader waiting.
   */
  failFast?: boolean
}

/**
 * Everything the UI needs from the backend. Pages talk to `store` and never to
 * Supabase directly, so the same UI runs against Supabase or the in-memory demo.
 *
 * Every method rejects with an `Error` whose `message` is safe to show to the user.
 */
export interface Store {
  readonly mode: 'supabase' | 'demo'

  // ── Reading (public) ────────────────────────────────────────────────────

  /** All trips, newest first. */
  listTrips(options?: ReadOptions): Promise<Trip[]>
  getTrip(slug: string, options?: ReadOptions): Promise<Trip | null>
  getTripById(id: string): Promise<Trip | null>
  /**
   * Days of a trip in date order, without their blocks. Drafts are returned
   * only when `includeDrafts` is set and the caller is signed in.
   */
  listDays(tripId: string, options?: ReadOptions & { includeDrafts?: boolean }): Promise<DaySummary[]>
  /**
   * One day with its blocks, or null if there is none. A signed-in admin also
   * receives drafts, so public pages must treat `published: false` as missing.
   */
  getDay(tripId: string, date: ISODate, options?: ReadOptions): Promise<Day | null>
  /** Public URL for a stored photo or video path. Synchronous and cheap. */
  mediaUrl(path: string): string
  /** What is published right now, for comparing with the backup copy. */
  publishedState(): Promise<PublishedState>

  // ── Sign-in ─────────────────────────────────────────────────────────────

  /** The signed-in admin, or null. Accounts without edit rights count as signed out. */
  getUser(): Promise<AdminUser | null>
  /** Calls back whenever the signed-in admin changes. Returns an unsubscribe function. */
  onAuthChange(callback: (user: AdminUser | null) => void): () => void
  signIn(email: string, password: string): Promise<AdminUser>
  signOut(): Promise<void>

  // ── Writing (admin only) ────────────────────────────────────────────────

  /** Creates the trip when `input.id` is missing, otherwise updates it. */
  saveTrip(input: TripInput): Promise<Trip>
  /** Deletes the trip, its days, and all of its stored media. */
  deleteTrip(id: string): Promise<void>
  /** Creates or replaces the day for `input.tripId` + `input.date`. */
  saveDay(input: DayInput): Promise<Day>
  /** Deletes the day and its stored media. */
  deleteDay(tripId: string, date: ISODate): Promise<void>
  /**
   * Shrinks the image in the browser, then stores a full-size and a thumbnail
   * copy under `folder`. Use `mediaFolder()` from media.ts to build `folder`.
   */
  uploadPhoto(file: File, folder: string): Promise<Photo>
  /**
   * Stores a video clip under `folder`. `onProgress` receives a fraction from
   * 0 to 1. Rejects if the file is not a video or is over `MAX_VIDEO_BYTES`.
   * Aborting `signal` rejects with an error named "AbortError".
   */
  uploadVideo(
    file: File,
    folder: string,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<{ path: string }>
  /** Removes stored files. Unknown paths are ignored. */
  deleteMedia(paths: string[]): Promise<void>
  /** How much space the stored photos and clips take, to show against the plan's allowance. */
  storageUsage(): Promise<StorageUsage>
}

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

/** Supabase when it is configured, otherwise an in-memory demo with sample content. */
export const store: Store = url && key ? createSupabaseStore(url, key) : createDemoStore()

/** The backup copy that is published beside the site, or null where there is none (the demo). */
export const backupCopy: Snapshot | null =
  store.mode === 'supabase' && typeof document !== 'undefined'
    ? createSnapshot(new URL('snapshot/', document.baseURI).href)
    : null

/**
 * What the public pages read through. It asks `store` first and, if the server
 * can't be reached, serves the backup copy that is published with the site
 * (see scripts/snapshot.mjs). The admin pages use `store` directly: an editor
 * must never mistake a copy for the real thing.
 */
export const reader = createReader(store, backupCopy)
