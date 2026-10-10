import { RESERVED_SLUGS } from '../config'
import { isISODate } from './dates'
import type { TripInput } from './types'

/** "India & Nepal" → "india-nepal" */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A user-facing description of what's wrong with the trip, or null if it's fine. */
export function tripProblem(input: TripInput): string | null {
  if (!input.title.trim()) return 'Give the trip a title.'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    return 'The web address can only use lowercase letters, numbers, and hyphens.'
  }
  if (RESERVED_SLUGS.includes(input.slug)) return `"${input.slug}" is reserved. Choose a different web address.`
  if (!isISODate(input.startDate) || !isISODate(input.endDate)) return 'Choose a start date and an end date.'
  if (input.endDate < input.startDate) return 'The end date is before the start date.'
  return null
}
