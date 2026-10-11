import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js'
import type { PostgrestSingleResponse, Session, User } from '@supabase/supabase-js'
import { isISODate } from './dates'
import { UnreachableError } from './errors'
import { assertVideoFile, mediaFolder, newId, processPhoto, videoFormat } from './media'
import type { ReadOptions, Store } from './store'
import type { AdminUser, Block, Day, DaySummary, Photo, Trip } from './types'
import { tripProblem } from './validate'

// The tables, the storage bucket and every access rule are defined in supabase/schema.sql.
// Nothing here is what keeps strangers out: the database enforces that on its own. The
// checks in this file only exist so that the owner gets a clear message instead of a
// refusal from the server.

const BUCKET = 'media'
/** A stored file is never rewritten (every upload gets a new name), so browsers may keep it for a year. */
const CACHE_SECONDS = '31536000'
/** How many files Storage lists per request, and how many are removed per request. */
const BATCH = 100

const OFFLINE = "Couldn't reach the server. Check your connection and try again."
const RESTRICTED = 'The database is refusing requests. The Supabase project may be over its plan limits: check its dashboard.'
const SIGNED_OUT = 'Sign in to make changes.'
const NOT_ALLOWED = "This account doesn't have permission to edit."
const NOT_SET_UP = "The site's database isn't set up yet. Run supabase/schema.sql in the Supabase SQL Editor."
const TRIP_GONE = 'That trip no longer exists.'

// ── Rows as the database stores them ──────────────────────────────────────

type TripRow = {
  id: string
  slug: string
  title: string
  start_date: string
  end_date: string
  cover: Photo | null
  created_at: string
}

type DayRow = {
  trip_id: string
  date: string
  location: string
  blocks: Block[]
  published: boolean
  updated_at: string
}

/** Mirrors supabase/schema.sql, so table and column names in queries are checked by the compiler. */
type Database = {
  public: {
    Tables: {
      trips: { Row: TripRow; Insert: Omit<TripRow, 'id' | 'created_at'>; Update: Partial<TripRow>; Relationships: [] }
      days: { Row: DayRow; Insert: Omit<DayRow, 'updated_at'>; Update: Partial<DayRow>; Relationships: [] }
    }
    Views: { [name in never]: never }
    Functions: { is_admin: { Args: never; Returns: boolean } }
  }
}

const toTrip = (row: TripRow): Trip => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  startDate: row.start_date,
  endDate: row.end_date,
  cover: row.cover,
})

const toSummary = (row: Pick<DayRow, 'trip_id' | 'date' | 'location' | 'published'>): DaySummary => ({
  tripId: row.trip_id,
  date: row.date,
  location: row.location,
  published: row.published,
})

const toDay = (row: DayRow): Day => ({ ...toSummary(row), blocks: row.blocks, updatedAt: row.updated_at })

// ── Errors ────────────────────────────────────────────────────────────────

/**
 * Turns whatever Supabase reported into an Error whose message can be shown as it is.
 * Supabase's own wording is written for developers, so it goes to the console instead.
 * `writing` marks a request that only an admin may make: there, a refusal means the
 * account isn't an admin, while on a public page it could only mean a setup mistake.
 */
function toError(cause: unknown, fallback = 'Something went wrong. Please try again.', writing = false): Error {
  const report = (typeof cause === 'object' && cause !== null ? cause : {}) as Record<string, unknown>
  const code = String(report.code ?? '')
  // Storage often answers with a plain 400 and puts the real status in the body.
  const status = Number(report.statusCode) || Number(report.status) || 0

  const unreachable =
    cause instanceof TypeError ||
    isAuthRetryableFetchError(cause) ||
    report.name === 'StorageUnknownError' ||
    report.status === 0 ||
    status >= 500
  if (unreachable) return new UnreachableError(OFFLINE)
  // 402 is how Supabase answers once it has restricted a project for exceeding its plan's
  // limits. Nothing is being served, so readers should get the backup copy, as for an outage.
  if (status === 402) return new UnreachableError(RESTRICTED)
  // A missing table, function or bucket: the setup script hasn't been run on this project.
  if (['PGRST202', 'PGRST205', '42P01'].includes(code) || /bucket not found/i.test(String(report.message))) {
    return new Error(NOT_SET_UP)
  }
  if (writing && (status === 401 || status === 403 || code === '42501')) {
    // If the device remembered this login as an admin, it was wrong: ask the server next time.
    rememberAdmin(null)
    return new Error(NOT_ALLOWED)
  }
  console.error(cause)
  return new Error(fallback)
}

/** The data of a database response, or a thrown Error if the request failed. */
function unwrap<T>(response: PostgrestSingleResponse<T>, fallback?: string, writing = false): T {
  if (response.error) {
    const { code, message, details, hint } = response.error
    // The HTTP status travels beside the error rather than on it; 0 means the request never arrived.
    throw toError({ code, message, details, hint, status: response.status }, fallback, writing)
  }
  return response.data
}

const REQUEST_TIMEOUT_MS = 20_000
/** Photo uploads get longer: a few hundred kilobytes can take a while on a weak signal. */
const UPLOAD_TIMEOUT_MS = 3 * 60_000

/**
 * A stalled mobile connection can leave a request hanging for minutes with no
 * answer at all. Giving up after a while turns "Saving…" forever into an error
 * the owner can retry. (Video clips are not affected: they go through the
 * resumable uploader, which has its own retries.)
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  if (init?.signal || typeof AbortSignal.timeout !== 'function') return fetch(input, init)
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const uploading = init?.method === 'POST' && target.includes('/storage/v1/object/')
  return fetch(input, { ...init, signal: AbortSignal.timeout(uploading ? UPLOAD_TIMEOUT_MS : REQUEST_TIMEOUT_MS) })
}

/** How long a reader's single attempt may take before the backup copy is used instead. */
const QUICK_TIMEOUT_MS = 8_000

/**
 * Applies `failFast` to a query: no automatic retries (they add up to seven
 * seconds of waiting when the project is paused) and a shorter time limit.
 */
function paced<Query extends { retry(enabled: boolean): Query; abortSignal(signal: AbortSignal): Query }>(
  query: Query,
  options: ReadOptions | undefined,
): Query {
  if (!options?.failFast) return query
  const single = query.retry(false)
  return typeof AbortSignal.timeout === 'function' ? single.abortSignal(AbortSignal.timeout(QUICK_TIMEOUT_MS)) : single
}

const ADMIN_KEY = 'travel-admin'

/** The id of the login last confirmed as an admin on this device, if any. */
function rememberedAdmin(): string | null {
  try {
    return localStorage.getItem(ADMIN_KEY)
  } catch {
    return null
  }
}

function rememberAdmin(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(ADMIN_KEY, userId)
    else localStorage.removeItem(ADMIN_KEY)
  } catch {
    // Storage can be unavailable (private browsing); the check is then simply asked each time.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids arrive from the address bar; one that isn't a UUID can't match a row, and Postgres would reject it outright. */
const isId = (value: string) => UUID.test(value)

// ── The store ─────────────────────────────────────────────────────────────

export function createSupabaseStore(url: string, key: string): Store {
  const base = url.replace(/\/+$/, '')
  const supabase = createClient<Database>(base, key, {
    // Hash routing owns the URL fragment, so sessions are never read from it.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  })
  const bucket = supabase.storage.from(BUCKET)

  // ── Who is signed in ────────────────────────────────────────────────────

  /** Admin checks in flight or answered "yes", by user id. */
  const adminChecks = new Map<string, Promise<boolean>>()
  let lastUser: AdminUser | null = null

  // supabase-js repeats its sign-in event whenever the tab regains focus. Handing back the
  // same object for the same person lets React see that nothing changed, so an open editor
  // isn't re-rendered (or reloaded) every time the owner switches tabs.
  const toAdminUser = (user: User): AdminUser => {
    const email = user.email ?? ''
    if (lastUser?.id !== user.id || lastUser.email !== email) lastUser = { id: user.id, email }
    return lastUser
  }

  const currentSession = async (): Promise<Session | null> => {
    const { data, error } = await supabase.auth.getSession()
    // Any other error means the saved session is no longer valid, which is the same as none.
    if (error && isAuthRetryableFetchError(error)) throw new UnreachableError(OFFLINE)
    return data.session
  }

  /**
   * Whether the session belongs to an admin. Only a "yes" is remembered: it can't stop being
   * true under a signed-in owner, whereas a "no" has to be asked again once the owner has
   * run the setup script.
   *
   * A "yes" is also kept on the device, so the editor opens without waiting on a request
   * (it matters on a slow connection, and it lets an open draft survive going offline).
   * It is only a convenience: the database checks every write itself, so a stale "yes"
   * can show the editor but can't change anything.
   */
  const isAdmin = (session: Session, askAgain = false): Promise<boolean> => {
    const userId = session.user.id
    const known = askAgain ? undefined : adminChecks.get(userId)
    if (known) return known
    if (!askAgain && rememberedAdmin() === userId) return Promise.resolve(true)

    const check = (async () => {
      // Sent with this session's own token, so the answer is about this user even if
      // someone else has signed in by the time the request leaves. A GET, because
      // supabase-js retries those when a connection drops.
      const request = supabase.rpc('is_admin', undefined, { get: true })
      return unwrap(await request.setHeader('Authorization', `Bearer ${session.access_token}`)) === true
    })()
    adminChecks.set(userId, check)
    const forget = () => {
      if (adminChecks.get(userId) === check) adminChecks.delete(userId)
    }
    check.then((yes) => {
      if (yes) {
        rememberAdmin(userId)
      } else {
        forget()
        if (rememberedAdmin() === userId) rememberAdmin(null)
      }
    }, forget)
    return check
  }

  const adminOf = async (session: Session | null): Promise<AdminUser | null> =>
    session && (await isAdmin(session)) ? toAdminUser(session.user) : null

  /** Gives writes the same "sign in first" message as the demo, instead of a refusal from the server. */
  const requireAdmin = async (): Promise<Session> => {
    const session = await currentSession()
    if (!session || !(await isAdmin(session))) throw new Error(SIGNED_OUT)
    return session
  }

  // ── Stored files ────────────────────────────────────────────────────────

  /** Every file under a folder, including those in sub-folders. */
  const filesUnder = async (folder: string): Promise<string[]> => {
    const files: string[] = []
    const folders: string[] = []
    for (let offset = 0; ; offset += BATCH) {
      const { data, error } = await bucket.list(folder, { limit: BATCH, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw toError(error)
      // Storage has no real folders: an entry without an id is a prefix shared by deeper files.
      for (const entry of data) (entry.id === null ? folders : files).push(`${folder}/${entry.name}`)
      if (data.length < BATCH) break
    }
    // A trip has one folder per day. Looking through them side by side keeps deleting a
    // long trip to a few seconds on a slow connection.
    const deeper = await Promise.all(folders.map(filesUnder))
    return files.concat(...deeper)
  }

  const removeFiles = async (paths: string[]) => {
    for (let start = 0; start < paths.length; start += BATCH) {
      const { error } = await bucket.remove(paths.slice(start, start + BATCH))
      if (error) throw toError(error, "Couldn't delete the files. Please try again.", true)
    }
  }

  /**
   * Clears a folder once the trip or day it belonged to has been deleted. The row goes first
   * and the files second, and a failure here is only logged: a file left behind wastes a
   * little space, whereas deleting files first could leave an entry full of broken images.
   */
  const discard = async (folder: string) => {
    try {
      await removeFiles(await filesUnder(folder))
    } catch (error) {
      console.warn(`Some files under "${folder}" could not be removed.`, error)
    }
  }

  const putPhoto = async (path: string, image: Blob, name: string) => {
    const { error } = await bucket.upload(path, image, { contentType: 'image/jpeg', cacheControl: CACHE_SECONDS, upsert: false })
    if (error) throw toError(error, `Couldn't upload "${name}". Please try again.`, true)
  }

  return {
    mode: 'supabase',

    async listTrips(options) {
      const query = supabase.from('trips').select().order('start_date', { ascending: false }).order('created_at', { ascending: false })
      return unwrap(await paced(query, options)).map(toTrip)
    },
    async getTrip(slug, options) {
      const row = unwrap(await paced(supabase.from('trips').select().eq('slug', slug), options).maybeSingle())
      return row && toTrip(row)
    },
    async getTripById(id) {
      if (!isId(id)) return null
      const row = unwrap(await supabase.from('trips').select().eq('id', id).maybeSingle())
      return row && toTrip(row)
    },
    async listDays(tripId, options) {
      if (!isId(tripId)) return []
      let query = supabase.from('days').select('trip_id, date, location, published').eq('trip_id', tripId)
      // The database hides drafts from everyone but an admin anyway. This filter is for the
      // admin, who would otherwise see their own drafts on the public pages.
      if (!options?.includeDrafts) query = query.eq('published', true)
      return unwrap(await paced(query.order('date'), options)).map(toSummary)
    },
    async getDay(tripId, date, options) {
      if (!isId(tripId) || !isISODate(date)) return null
      const query = supabase.from('days').select().eq('trip_id', tripId).eq('date', date)
      const row = unwrap(await paced(query, options).maybeSingle())
      return row && toDay(row)
    },
    mediaUrl: (path) => `${base}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`,
    async publishedState() {
      // Filtered explicitly, because a signed-in admin is also shown drafts.
      const response = await supabase
        .from('days')
        .select('updated_at', { count: 'exact' })
        .eq('published', true)
        .order('updated_at', { ascending: false })
        .limit(1)
      const rows = unwrap(response)
      return { days: response.count ?? rows.length, latest: rows[0]?.updated_at ?? null }
    },

    async getUser() {
      return adminOf(await currentSession())
    },
    onAuthChange(callback) {
      let latest = 0
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        // The first event only repeats what getUser() reports.
        if (event === 'INITIAL_SESSION') return
        const turn = ++latest
        // supabase-js can deadlock when this callback waits on another Supabase call, so
        // the admin check starts only after the callback has returned.
        setTimeout(() => {
          adminOf(session)
            .catch(() => null)
            .then((user) => {
              // A slow answer must not overwrite the result of a later event.
              if (turn === latest) callback(user)
            })
        }, 0)
      })
      return () => {
        latest = -1
        data.subscription.unsubscribe()
      }
    },
    async signIn(email, password) {
      if (!email.trim() || !password) throw new Error('Enter an email and a password.')
      const { data, error } = await supabase.auth
        .signInWithPassword({ email: email.trim(), password })
        .catch((cause: unknown) => {
          throw toError(cause)
        })
      if (error || !data.session) {
        if (error?.code === 'invalid_credentials') throw new Error('Wrong email or password.')
        if (error?.code === 'email_not_confirmed') {
          throw new Error("This login hasn't been confirmed yet. Confirm it in Supabase under Authentication > Users.")
        }
        throw toError(error, "Couldn't sign in. Please try again.")
      }

      let allowed = false
      try {
        allowed = await isAdmin(data.session, true)
      } finally {
        // Anyone who isn't confirmed as an admin must not stay signed in on this device.
        if (!allowed) await supabase.auth.signOut({ scope: 'local' })
      }
      if (!allowed) throw new Error(NOT_ALLOWED)
      return toAdminUser(data.session.user)
    },
    async signOut() {
      rememberAdmin(null)
      // 'local' ends the session in this browser only. The default would also sign the
      // owner out on their other devices.
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (!error) return
      // Offline, the session is normally cleared regardless. Only complain if it is still there.
      const { error: stillSignedIn } = await supabase.auth.getSession()
      if (stillSignedIn) throw toError(error, "Couldn't sign out. Please try again.")
    },

    async saveTrip(input) {
      await requireAdmin()
      const problem = tripProblem(input)
      if (problem) throw new Error(problem)
      const row = {
        slug: input.slug,
        title: input.title.trim(),
        start_date: input.startDate,
        end_date: input.endDate,
        cover: input.cover,
      }
      const response: PostgrestSingleResponse<TripRow | null> = input.id
        ? await supabase.from('trips').update(row).eq('id', input.id).select().maybeSingle()
        : await supabase.from('trips').insert(row).select().single()
      // 23505 is Postgres for "that value is taken", and the slug is the only value that can be.
      if (response.error?.code === '23505') throw new Error('Another trip already uses that web address.')
      const saved = unwrap(response, "Couldn't save the trip. Please try again.", true)
      if (!saved) throw new Error(TRIP_GONE)
      return toTrip(saved)
    },
    async deleteTrip(id) {
      await requireAdmin()
      // Nothing can exist under an id that isn't one. This also keeps an empty or
      // malformed id from ever being used as the folder to clear.
      if (!isId(id)) return
      // Its days go with it: the database deletes them along with the trip.
      unwrap(await supabase.from('trips').delete().eq('id', id), "Couldn't delete the trip. Please try again.", true)
      await discard(id)
    },
    async saveDay(input) {
      await requireAdmin()
      const response = await supabase
        .from('days')
        .upsert(
          {
            trip_id: input.tripId,
            date: input.date,
            location: input.location.trim(),
            blocks: input.blocks,
            published: input.published,
          },
          { onConflict: 'trip_id,date' },
        )
        .select()
        .single()
      // 23503 is Postgres for "this refers to a row that isn't there": the trip was deleted.
      if (response.error?.code === '23503') throw new Error(TRIP_GONE)
      return toDay(unwrap(response, "Couldn't save the day. Please try again.", true))
    },
    async deleteDay(tripId, date) {
      await requireAdmin()
      if (!isId(tripId) || !isISODate(date)) return
      unwrap(
        await supabase.from('days').delete().eq('trip_id', tripId).eq('date', date),
        "Couldn't delete the day. Please try again.",
        true,
      )
      await discard(mediaFolder(tripId, date))
    },
    async uploadPhoto(file, folder) {
      await requireAdmin()
      const { full, thumb, width, height } = await processPhoto(file)
      const id = newId()
      const photo: Photo = { path: `${folder}/${id}.jpg`, thumbPath: `${folder}/${id}_thumb.jpg`, width, height }
      await putPhoto(photo.path, full, file.name)
      try {
        await putPhoto(photo.thumbPath, thumb, file.name)
      } catch (error) {
        // Half a photo is of no use to anyone, so the full-size copy goes too.
        await bucket.remove([photo.path])
        throw error
      }
      return photo
    },
    async uploadVideo(file, folder, onProgress, signal) {
      let token = (await requireAdmin()).access_token
      assertVideoFile(file)
      const cancelled = () => new DOMException('Upload cancelled.', 'AbortError')
      // Loaded on demand so that readers of the public site never download the uploader.
      // Loading fails when offline, and also in a tab left open across a new deploy.
      const { Upload } = await import('tus-js-client').catch(() => {
        throw new Error("Couldn't load the video uploader. Reload the page and try again.")
      })
      if (signal?.aborted) throw cancelled()

      const format = videoFormat(file)
      const path = `${folder}/${newId()}.${format.extension}`

      return new Promise<{ path: string }>((resolve, reject) => {
        const finish = (settle: () => void) => {
          signal?.removeEventListener('abort', abort)
          settle()
        }
        // A resumable upload sends the clip in pieces and carries on from the last piece
        // that arrived, which is what makes a large file workable on a patchy connection.
        // The settings are the ones Supabase documents for its resumable endpoint.
        const upload = new Upload(file, {
          endpoint: `${base}/storage/v1/upload/resumable`,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: { apikey: key, 'x-upsert': 'false' },
          // The token is set here rather than in `headers` because a slow upload can outlast
          // the token it started with, and each piece needs one that is still valid.
          onBeforeRequest: async (request) => {
            token = (await currentSession().catch(() => null))?.access_token ?? token
            request.setHeader('Authorization', `Bearer ${token}`)
          },
          uploadDataDuringCreation: true,
          // tus-js-client keeps a note of each upload in localStorage. Nothing reads those
          // notes afterwards, so the note of a finished upload is cleared.
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: BUCKET,
            objectName: path,
            contentType: format.contentType,
            cacheControl: CACHE_SECONDS,
          },
          // Supabase only accepts pieces of exactly 6 MB.
          chunkSize: 6 * 1024 * 1024,
          onProgress: (sent, total) => onProgress?.(total > 0 ? sent / total : 0),
          onSuccess: () => finish(() => resolve({ path })),
          onError: (error) => {
            const response = 'originalResponse' in error ? error.originalResponse : null
            // No response at all means the request never got through.
            const cause = response ? { status: response.getStatus(), message: response.getBody() } : new TypeError(error.message)
            finish(() => reject(toError(cause, `Couldn't upload "${file.name}". Please try again.`, true)))
          },
        })
        function abort() {
          // `true` also deletes the part that has already reached the server.
          upload.abort(true).catch(() => {})
          finish(() => reject(cancelled()))
        }
        signal?.addEventListener('abort', abort, { once: true })
        upload.start()
      })
    },
    async deleteMedia(paths) {
      if (paths.length === 0) return
      await requireAdmin()
      await removeFiles(paths)
    },
  }
}
