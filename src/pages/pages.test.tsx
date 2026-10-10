import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SITE_TAGLINE, SITE_TITLE } from '../config'
import type { Crumb } from '../lib/crumbs'
import type { AdminUser, Day, DaySummary, Trip } from '../lib/types'
import TripPage from './TripPage'
import TripsPage from './TripsPage'

// The pages are rendered once, to a string, with every load already answered:
// `results` maps the dependencies a page passes to useAsync to what came back.
const state = vi.hoisted(() => ({
  results: new Map<string, { data?: unknown; error?: Error }>(),
  crumbs: [] as Crumb[],
  user: null as AdminUser | null,
  today: '2026-10-11',
}))

vi.mock('../lib/useAsync', () => ({
  useAsync: (_load: unknown, deps: unknown[]) => {
    const result = state.results.get(JSON.stringify(deps))
    return { data: result?.data, error: result?.error ?? null, loading: !result, reload: () => {} }
  },
}))
vi.mock('../lib/crumbs', () => ({
  useCrumbs: (crumbs: Crumb[]) => {
    state.crumbs = crumbs
  },
}))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: state.user, loading: false }) }))
vi.mock('../lib/store', () => ({ store: { mediaUrl: (path: string) => `https://media.test/${path}` } }))
vi.mock('../lib/dates', async (original) => ({
  ...(await original<typeof import('../lib/dates')>()),
  today: () => state.today,
}))
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  Navigate: ({ to }: { to: string }) => createElement('i', { 'data-redirect': to }),
}))

const trip: Trip = {
  id: 't1',
  slug: 'india-nepal',
  title: 'India & Nepal',
  startDate: '2026-10-07',
  endDate: '2026-11-12',
  cover: null,
}
const summary = (date: string, location: string): DaySummary => ({ tripId: 't1', date, location, published: true })
const days = [summary('2026-10-07', 'Delhi'), summary('2026-10-08', 'Agra'), summary('2026-10-09', 'Jaipur')]
const entry = (date: string, location: string, published = true): Day => ({
  tripId: 't1',
  date,
  location,
  published,
  updatedAt: `${date}T18:00:00Z`,
  blocks: [{ id: 'b1', type: 'text', text: `Words from ${location}.` }],
})

const answer = (deps: unknown[], data: unknown) => state.results.set(JSON.stringify(deps), { data })
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')

beforeEach(() => {
  state.results.clear()
  state.crumbs = []
  state.user = null
  state.today = '2026-10-11'
})

describe('TripsPage', () => {
  const render = () =>
    renderToStaticMarkup(
      <MemoryRouter>
        <TripsPage />
      </MemoryRouter>,
    )

  it('shows a lone trip as one large tile, with a drawn cover when it has no photo', () => {
    answer([], [trip])
    const html = render()
    expect(text(html)).toContain(`${SITE_TITLE} ${SITE_TAGLINE}`)
    expect(html).toMatch(/<a [^>]*href="\/india-nepal"/)
    expect(text(html)).toContain('On the road now India & Nepal October 7 – November 12, 2026 Read the journal')
    expect(html).toContain('<svg')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('More trips')
    expect(state.crumbs).toEqual([])
  })

  it('leaves the marker off a trip that is not under way', () => {
    state.today = '2026-12-01'
    answer([], [trip])
    expect(render()).not.toContain('On the road now')
  })

  it('features the trip under way and lists the others, using each cover photo', () => {
    const cover = { path: 'cover.jpg', thumbPath: 'cover_thumb.jpg', width: 2000, height: 1500 }
    const japan: Trip = { ...trip, id: 't2', slug: 'japan', title: 'Japan', startDate: '2027-04-01', endDate: '2027-04-20' }
    const peru: Trip = { ...trip, id: 't0', slug: 'peru', title: 'Peru', startDate: '2025-05-01', endDate: '2025-05-20' }
    answer([], [japan, { ...trip, cover }, { ...peru, cover }])
    const html = render()
    const order = [...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((match) => match[1])
    expect(order).toEqual(['India &amp; Nepal', 'Japan', 'Peru'])
    expect(html.match(/On the road now/g)).toHaveLength(1)
    expect(html).toContain('More trips')
    // Only the big tile is offered the full-size photo, and only on a wide screen.
    expect(html.match(/<source /g)).toHaveLength(1)
    expect(html).toMatch(/<source [^>]*srcSet="https:\/\/media\.test\/cover\.jpg"/)
    expect(html.match(/<img [^>]*src="https:\/\/media\.test\/cover_thumb\.jpg"/g)).toHaveLength(2)
  })

  it('covers loading, failure and having no trips', () => {
    expect(render()).toContain('role="status"')
    answer([], [])
    expect(render()).toContain('No trips yet')
    state.results.set('[]', { error: new Error('The network is down.') })
    expect(text(render())).toContain('The network is down. Try again')
  })
})

describe('TripPage', () => {
  const render = (path: string) =>
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:tripSlug" element={<TripPage />} />
          <Route path="/:tripSlug/:date" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )
  const current = (html: string) => /<a [^>]*aria-current="page"[^>]*>/.exec(html)?.[0] ?? ''

  beforeEach(() => {
    answer(['india-nepal'], trip)
    answer(['t1'], days)
  })

  it('shows the day in the address, with the list of days beside it', () => {
    answer(['t1', '2026-10-08'], entry('2026-10-08', 'Agra'))
    const html = render('/india-nepal/2026-10-08')
    expect(html).toMatch(/<h1[^>]*>October 8<span[^>]*>\u00a0· <\/span>Agra<\/h1>/)
    expect(text(html)).toContain('Day 2 · Thursday')
    expect(text(html)).toContain('Words from Agra.')
    // The sidebar: trip, dates, then each day with its number, date and place.
    expect(text(html)).toContain('India & Nepal October 7 – November 12, 2026')
    expect(text(html)).toContain('Day 1 Oct 7 Delhi')
    expect(html.match(/<a [^>]*href="\/india-nepal\/2026-10-0\d"/g)).toHaveLength(3 + 2) // list + previous/next
    expect(current(html)).toContain('href="/india-nepal/2026-10-08"')
    expect(text(html)).toContain('Previous October 7 Delhi')
    expect(text(html)).toContain('Next October 9 Jaipur')
    expect(state.crumbs).toEqual([{ label: 'India & Nepal', to: '/india-nepal' }, { label: 'October 8' }])
    expect(html).not.toContain('data-redirect')
    expect(html).not.toContain('Edit this day')
  })

  it('opens the latest day while the trip is under way, and the first otherwise', () => {
    expect(render('/india-nepal')).toContain('data-redirect="/india-nepal/2026-10-09"')
    expect(state.crumbs.at(-1)).toEqual({ label: 'October 9' })
    state.today = '2026-12-01'
    expect(render('/india-nepal')).toContain('data-redirect="/india-nepal/2026-10-07"')
  })

  it('says so when the day has no entry, and keeps the list usable', () => {
    answer(['t1', '2026-10-20'], null)
    const html = render('/india-nepal/2026-10-20')
    expect(text(html)).toContain('No entry for that day')
    expect(html.match(/<a [^>]*href="\/india-nepal\/2026-10-0\d"/g)).toHaveLength(3 + 1)
    expect(current(html)).toBe('')
    expect(text(html)).toContain('Previous October 9 Jaipur')
    expect(state.crumbs.at(-1)).toEqual({ label: 'October 20' })
  })

  it('treats an address that is not a date the same way', () => {
    const html = render('/india-nepal/tomorrow')
    expect(text(html)).toContain('No entry for that day')
    expect(text(html)).toContain('Day 1 Oct 7 Delhi')
    expect(state.crumbs.at(-1)).toEqual({ label: 'No entry' })
  })

  it('never shows a draft, but tells the signed-in owner why and offers to edit', () => {
    state.user = { id: 'u1', email: 'owner@example.com' }
    answer(['t1', '2026-10-10'], entry('2026-10-10', 'Pushkar', false))
    const html = render('/india-nepal/2026-10-10')
    expect(text(html)).not.toContain('Words from Pushkar.')
    expect(text(html)).toContain('No entry for that day')
    expect(text(html)).toContain('draft')
    expect(html).toMatch(/<a [^>]*href="\/admin\/trips\/t1\/days\/2026-10-10"[^>]*>.*Edit this day<\/a>/)
  })

  it('has a note for a trip with nothing published yet', () => {
    answer(['t1'], [])
    const html = render('/india-nepal')
    expect(text(html)).toContain('Nothing posted yet. Check back soon.')
    expect(html).not.toContain('data-redirect')
    expect(state.crumbs).toEqual([{ label: 'India & Nepal' }])
  })

  it('still looks up a dated address when the list is empty, in case the day is newer than the list', () => {
    answer(['t1'], [])
    answer(['t1', '2026-10-07'], entry('2026-10-07', 'Delhi'))
    expect(text(render('/india-nepal/2026-10-07'))).toContain('Words from Delhi.')

    answer(['t1', '2026-10-07'], null)
    const html = render('/india-nepal/2026-10-07')
    expect(text(html)).toContain('No entry for that day Nothing posted yet. Check back soon.')
    expect(html).not.toContain('aria-label="Days"')
  })

  it('shows the day in the address even if the list of days fails to load', () => {
    state.results.set('["t1"]', { error: new Error('The network is down.') })
    answer(['t1', '2026-10-08'], entry('2026-10-08', 'Agra'))
    const html = render('/india-nepal/2026-10-08')
    expect(text(html)).toContain('Words from Agra.')
    expect(text(html)).toMatch(/The list of days didn't load\. ?Try again/)
    // Without a date there is no day to fall back on, so the error takes the page.
    expect(text(render('/india-nepal'))).toContain('The network is down. Try again')
  })

  it('sends an unknown trip to the not-found page', () => {
    answer(['nowhere'], null)
    expect(text(render('/nowhere'))).toContain("Off the map There's no trip at this address.")
  })

  it('keeps the list in place while the day is still loading', () => {
    const html = render('/india-nepal/2026-10-08')
    expect(html).toContain('aria-label="Loading the day"')
    expect(current(html)).toContain('href="/india-nepal/2026-10-08"')
  })
})
