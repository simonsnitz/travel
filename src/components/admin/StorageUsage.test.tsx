import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StorageUsage from './StorageUsage'

const state: { usage: { bytes: number; files: number } | undefined } = { usage: undefined }

vi.mock('../../lib/useAsync', () => ({ useAsync: () => ({ data: state.usage, error: null, loading: false, reload: () => {} }) }))
vi.mock('../../lib/store', () => ({ store: {} }))

const render = (bytes?: number) => {
  state.usage = bytes === undefined ? undefined : { bytes, files: 4 }
  return renderToStaticMarkup(createElement(StorageUsage))
}

describe('StorageUsage', () => {
  it('says nothing until the total is known', () => {
    expect(render()).toBe('')
  })

  it('states what is used against the allowance', () => {
    const html = render(1_133_274)
    expect(html).toContain('1.1 MB of 1 GB of storage used')
    expect(html).toContain('aria-valuenow="0"')
    expect(html).toContain('width:1%')
  })

  it('warns as the allowance runs out, and points to the option that takes no space', () => {
    const html = render(850_000_000)
    expect(html).toContain('Storage is 85% full: 850 MB of 1 GB used')
    expect(html).toContain('YouTube or Vimeo links')
    expect(html).toContain('width:85%')
  })

  it('says so when storage is full', () => {
    expect(render(1_050_000_000)).toContain('Storage is full: 1.05 GB of 1 GB used')
  })
})
