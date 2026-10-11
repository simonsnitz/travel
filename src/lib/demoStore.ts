import { assertVideoFile, newId, processPhoto, videoFormat } from './media'
import type { Store } from './store'
import type { AdminUser, Day, Photo, Trip } from './types'
import { tripProblem } from './validate'

const SESSION_KEY = 'travel-demo-user'
const SAMPLE_VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'

const delay = (ms = 150) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const clone = <T>(value: T): T => structuredClone(value)

/**
 * In-memory stand-in for Supabase, used when no project is configured. It holds
 * sample content, accepts any sign-in, and forgets every change on reload.
 */
export function createDemoStore(): Store {
  /** Storage path → URL (a data: URL for samples, a blob: URL for uploads). */
  const media = new Map<string, string>()
  const listeners = new Set<(user: AdminUser | null) => void>()
  let user = readSession()

  const samplePhoto = (label: string, width: number, height: number, from: string, to: string, caption?: string): Photo => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<text x="50%" y="50%" fill="rgba(255,255,255,.9)" font-family="Georgia, serif" font-size="${Math.round(Math.min(width, height) / 12)}" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`
    const path = `demo/${newId()}.svg`
    media.set(path, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    return { path, thumbPath: path, width, height, ...(caption ? { caption } : {}) }
  }

  const tripId = 'demo-india-nepal'
  const trips: Trip[] = [
    { id: tripId, slug: 'india-nepal', title: 'India & Nepal', startDate: '2026-10-07', endDate: '2026-11-12', cover: null },
  ]
  const days: Day[] = [
    {
      tripId,
      date: '2026-10-07',
      location: 'Delhi',
      published: true,
      updatedAt: '2026-10-07T18:00:00Z',
      blocks: [
        {
          id: newId(),
          type: 'text',
          text:
            'This is sample content. The site is running in demo mode because no Supabase project is configured yet, so nothing here is real and nothing you change is saved.\n\n' +
            'Each day is built from blocks: paragraphs, photos, and videos, in whatever order tells the story best.',
        },
        {
          id: newId(),
          type: 'photos',
          photos: [samplePhoto('Sample photo', 1600, 1000, '#c4572e', '#e9a23b', 'A single photo is shown large.')],
        },
        {
          id: newId(),
          type: 'text',
          text: 'Several photos in one block are laid out as a grid. Select any photo to see it full screen.',
        },
        {
          id: newId(),
          type: 'photos',
          photos: [
            samplePhoto('One', 1200, 900, '#2f6f6a', '#8fb996'),
            samplePhoto('Two', 900, 1200, '#8a3719', '#d98e5f', 'Captions are optional.'),
            samplePhoto('Three', 1200, 900, '#b8862f', '#f0cf8a'),
          ],
        },
        {
          id: newId(),
          type: 'video',
          source: 'embed',
          url: SAMPLE_VIDEO,
          caption: 'A video can be an uploaded clip, or a YouTube or Vimeo link.',
        },
      ],
    },
    {
      tripId,
      date: '2026-10-08',
      location: 'Agra',
      published: true,
      updatedAt: '2026-10-08T18:00:00Z',
      blocks: [
        { id: newId(), type: 'text', text: 'A second sample day, so there is something to move between in the sidebar.' },
        {
          id: newId(),
          type: 'photos',
          photos: [samplePhoto('Morning', 1400, 1000, '#d98e04', '#f6d58b'), samplePhoto('Evening', 1400, 1000, '#6b3a5b', '#d97b5a')],
        },
        { id: newId(), type: 'text', text: 'Text can come before, between, or after photos and videos.' },
      ],
    },
    {
      tripId,
      date: '2026-10-09',
      location: 'Jaipur',
      published: true,
      updatedAt: '2026-10-09T18:00:00Z',
      blocks: [
        { id: newId(), type: 'text', text: 'A third sample day with one tall photo.' },
        { id: newId(), type: 'photos', photos: [samplePhoto('Portrait', 1000, 1400, '#a94522', '#f0b24a')] },
      ],
    },
    {
      tripId,
      date: '2026-10-10',
      location: 'Pushkar',
      published: false,
      updatedAt: '2026-10-10T18:00:00Z',
      blocks: [
        { id: newId(), type: 'text', text: 'This day is a draft. It shows up in the admin page but not on the public site.' },
      ],
    },
  ]

  const setUser = (next: AdminUser | null) => {
    user = next
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
      else sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Storage can be unavailable (private browsing); the in-memory value still works.
    }
    listeners.forEach((listener) => listener(next))
  }

  const requireAdmin = () => {
    if (!user) throw new Error('Sign in to make changes.')
  }

  const forgetMedia = (matches: (path: string) => boolean) => {
    for (const [path, url] of media) {
      if (!matches(path)) continue
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
      media.delete(path)
    }
  }

  return {
    mode: 'demo',

    async listTrips() {
      await delay()
      return clone(trips).sort((a, b) => b.startDate.localeCompare(a.startDate))
    },
    async getTrip(slug) {
      await delay()
      return clone(trips.find((trip) => trip.slug === slug) ?? null)
    },
    async getTripById(id) {
      await delay()
      return clone(trips.find((trip) => trip.id === id) ?? null)
    },
    async listDays(id, options) {
      await delay()
      const showDrafts = Boolean(options?.includeDrafts && user)
      return days
        .filter((day) => day.tripId === id && (day.published || showDrafts))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ tripId, date, location, published }) => ({ tripId, date, location, published }))
    },
    async getDay(id, date) {
      await delay()
      const day = days.find((candidate) => candidate.tripId === id && candidate.date === date)
      if (!day || (!day.published && !user)) return null
      return clone(day)
    },
    mediaUrl: (path) => media.get(path) ?? '',
    async publishedState() {
      const published = days.filter((day) => day.published)
      const latest = published.map((day) => day.updatedAt).sort().at(-1) ?? null
      return { days: published.length, latest }
    },

    async getUser() {
      return user
    },
    onAuthChange(callback) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    async signIn(email, password) {
      await delay(300)
      if (!email.trim() || !password) throw new Error('Enter an email and a password.')
      const next = { id: 'demo-admin', email: email.trim() }
      setUser(next)
      return next
    },
    async signOut() {
      setUser(null)
    },

    async saveTrip(input) {
      await delay()
      requireAdmin()
      const problem = tripProblem(input)
      if (problem) throw new Error(problem)
      if (trips.some((trip) => trip.slug === input.slug && trip.id !== input.id)) {
        throw new Error('Another trip already uses that web address.')
      }
      const trip: Trip = clone({
        id: input.id ?? newId(),
        slug: input.slug,
        title: input.title.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        cover: input.cover,
      })
      if (input.id) {
        const index = trips.findIndex((candidate) => candidate.id === input.id)
        if (index === -1) throw new Error('That trip no longer exists.')
        trips[index] = trip
      } else {
        trips.push(trip)
      }
      return clone(trip)
    },
    async deleteTrip(id) {
      await delay()
      requireAdmin()
      const index = trips.findIndex((trip) => trip.id === id)
      if (index !== -1) trips.splice(index, 1)
      for (let i = days.length - 1; i >= 0; i--) if (days[i].tripId === id) days.splice(i, 1)
      forgetMedia((path) => path.startsWith(`${id}/`))
    },
    async saveDay(input) {
      await delay()
      requireAdmin()
      if (!trips.some((trip) => trip.id === input.tripId)) throw new Error('That trip no longer exists.')
      const day: Day = clone({
        tripId: input.tripId,
        date: input.date,
        location: input.location.trim(),
        blocks: input.blocks,
        published: input.published,
        updatedAt: new Date().toISOString(),
      })
      const index = days.findIndex((candidate) => candidate.tripId === day.tripId && candidate.date === day.date)
      if (index === -1) days.push(day)
      else days[index] = day
      return clone(day)
    },
    async deleteDay(id, date) {
      await delay()
      requireAdmin()
      const index = days.findIndex((day) => day.tripId === id && day.date === date)
      if (index !== -1) days.splice(index, 1)
      forgetMedia((path) => path.startsWith(`${id}/${date}/`))
    },
    async uploadPhoto(file, folder) {
      requireAdmin()
      const { full, thumb, width, height } = await processPhoto(file)
      const id = newId()
      const photo: Photo = { path: `${folder}/${id}.jpg`, thumbPath: `${folder}/${id}_thumb.jpg`, width, height }
      media.set(photo.path, URL.createObjectURL(full))
      media.set(photo.thumbPath, URL.createObjectURL(thumb))
      return photo
    },
    async uploadVideo(file, folder, onProgress, signal) {
      requireAdmin()
      assertVideoFile(file)
      // Pretend to upload, so progress bars and cancelling can be tried out.
      const steps = 12
      for (let step = 1; step <= steps; step++) {
        await delay(120)
        if (signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError')
        onProgress?.(step / steps)
      }
      const path = `${folder}/${newId()}.${videoFormat(file).extension}`
      media.set(path, URL.createObjectURL(file))
      return { path }
    },
    async deleteMedia(paths) {
      requireAdmin()
      forgetMedia((path) => paths.includes(path))
    },
  }
}

function readSession(): AdminUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AdminUser) : null
  } catch {
    return null
  }
}
