import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Crumb } from '../lib/crumbs'
import type { AdminUser } from '../lib/types'
import Navbar from './Navbar'

const state = vi.hoisted(() => ({ crumbs: [] as Crumb[], user: null as AdminUser | null, loading: false }))

vi.mock('../lib/crumbs', () => ({ useCurrentCrumbs: () => state.crumbs }))
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ user: state.user, loading: state.loading, signIn: async () => {}, signOut: async () => {} }),
}))

const render = (path = '/india-nepal/2026-10-14') =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>,
  )

beforeEach(() => {
  state.crumbs = []
  state.user = null
  state.loading = false
})

describe('Navbar', () => {
  it('links home, and marks the link when home is the current page', () => {
    const homeLink = (html: string) => /<a [^>]*href="\/"[^>]*>/.exec(html)?.[0] ?? ''
    expect(homeLink(render())).toMatch(/aria-label="[^"]* home"/)
    expect(homeLink(render())).not.toContain('aria-current')
    expect(homeLink(render('/'))).toContain('aria-current="page"')
  })

  it('shows the trail as links, ending in the current page', () => {
    state.crumbs = [{ label: 'India & Nepal', to: '/india-nepal' }, { label: 'October 14' }]
    const html = render()
    expect(html).toMatch(/<nav [^>]*aria-label="Breadcrumb"/)
    expect(html).toMatch(/<a class="[^"]*" href="\/india-nepal">India &amp; Nepal<\/a>/)
    expect(html).toMatch(/<span class="[^"]*" aria-current="page">October 14<\/span>/)
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    // Read as text, the trail is a path.
    expect(html.replace(/<[^>]+>/g, '')).toContain('/India &amp; Nepal/October 14')
  })

  it('has no trail on a page that declares none', () => {
    expect(render('/')).not.toContain('Breadcrumb')
  })

  it('offers readers only a quiet link to the admin page', () => {
    const html = render()
    expect(html).toMatch(/<a class="[^"]*" href="\/admin">Admin<\/a>/)
    expect(html).not.toContain('Sign out')
  })

  it('adds a sign-out button for the owner', () => {
    state.user = { id: 'u1', email: 'owner@example.com' }
    const html = render()
    expect(html).toContain('href="/admin"')
    expect(html).toMatch(/<button type="button"[^>]*>.*Sign out.*<\/button>/)
  })

  it('shows neither until the saved session has been checked', () => {
    state.loading = true
    state.user = { id: 'u1', email: 'owner@example.com' }
    const html = render()
    expect(html).not.toContain('href="/admin"')
    expect(html).not.toContain('Sign out')
  })
})
