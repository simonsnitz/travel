import { describe, expect, it } from 'vitest'
import { slugify, tripProblem } from './validate'

const trip = { slug: 'india-nepal', title: 'India & Nepal', startDate: '2026-10-07', endDate: '2026-11-12', cover: null }

describe('slugify', () => {
  it('makes URL-friendly slugs', () => {
    expect(slugify('India & Nepal')).toBe('india-nepal')
    expect(slugify('  São Paulo, 2027!  ')).toBe('sao-paulo-2027')
    expect(slugify('&&&')).toBe('')
  })
})

describe('tripProblem', () => {
  it('accepts a valid trip', () => {
    expect(tripProblem(trip)).toBeNull()
  })

  it('explains what is wrong', () => {
    expect(tripProblem({ ...trip, title: '  ' })).toMatch(/title/)
    expect(tripProblem({ ...trip, slug: 'India Nepal' })).toMatch(/web address/)
    expect(tripProblem({ ...trip, slug: 'admin' })).toMatch(/reserved/)
    expect(tripProblem({ ...trip, startDate: '' })).toMatch(/start date/)
    expect(tripProblem({ ...trip, endDate: '2026-10-01' })).toMatch(/before/)
  })
})
