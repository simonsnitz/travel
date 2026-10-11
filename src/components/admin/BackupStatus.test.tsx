import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BackupStatus from './BackupStatus'
import type { BackupStatus as Status } from './backupCheck'

const state: { status: Status | null | undefined } = { status: undefined }

// The component only decides what to say for each status; working the status out is tested in backupCheck.test.ts.
vi.mock('../../lib/useAsync', () => ({ useAsync: () => ({ data: state.status, error: null, loading: false, reload: () => {} }) }))
vi.mock('../../lib/store', () => ({ store: {}, backupCopy: {} }))

const render = (status: Status | null | undefined) => {
  state.status = status
  return renderToStaticMarkup(createElement(BackupStatus))
}

describe('BackupStatus', () => {
  beforeEach(() => {
    state.status = undefined
  })

  it('says nothing while it is finding out, or when it cannot tell', () => {
    expect(render(undefined)).toBe('')
    expect(render(null)).toBe('')
  })

  it('reassures when the copy is current, without offering anything to do', () => {
    const html = render('current')
    expect(html).toContain('Backup copy is up to date')
    expect(html).not.toContain('<a ')
  })

  it('offers a way to update a copy that is behind or missing', () => {
    expect(render('behind')).toContain('have your latest changes yet')
    expect(render('missing')).toContain('There is no backup copy yet')
    for (const status of ['behind', 'missing'] as const) {
      expect(render(status)).toContain('href="https://github.com/simonsnitz/travel/actions/workflows/deploy.yml"')
    }
  })

  it('warns, and says how to fix it, when GitHub has stopped the daily run', () => {
    const html = render('off')
    expect(html).toContain('Automatic backups are switched off')
    expect(html).toContain('Enable workflow')
    expect(html).toContain('href="https://github.com/simonsnitz/travel/actions/workflows/deploy.yml"')
  })
})
