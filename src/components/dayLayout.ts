import type { Block, Photo } from '../lib/types'

/** Splits a text block into paragraphs at blank lines. Single line breaks stay inside a paragraph. */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n\s*/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

/**
 * Whether a block has anything to show. Blocks can be empty while they are
 * being written, and a kind of block this version doesn't know (saved by a
 * newer one, say) is skipped rather than allowed to break the page.
 */
export function blockHasContent(block: Block): boolean {
  switch (block.type) {
    case 'text':
      return block.text.trim() !== ''
    case 'photos':
      return block.photos.length > 0
    case 'video':
      return block.source === 'upload' ? block.path !== '' : block.url.trim() !== ''
    default:
      return false
  }
}

export function photoAlt(photo: Photo, location: string): string {
  const caption = photo.caption?.trim()
  if (caption) return caption
  const place = location.trim()
  return place ? `Photo from ${place}` : 'Photo'
}

export interface TileShape {
  /** Spans both columns of the two-column grid used in narrow spaces. */
  lead: boolean
  /** Takes half a row, instead of a third, in the three-column grid used in wide spaces. */
  half: boolean
}

/**
 * How one photo of a grid is sized so that every row comes out full, whatever
 * the number of photos. Two columns: an odd count opens with one wide photo.
 * Three columns: a remainder of one or two is absorbed by opening with rows of
 * two (4 = 2 + 2, 5 = 2 + 3, 7 = 2 + 2 + 3).
 */
export function tileShape(count: number, index: number): TileShape {
  const halves = count % 3 === 1 ? 4 : count % 3 === 2 ? 2 : 0
  return { lead: count % 2 === 1 && index === 0, half: index < halves }
}

/** A link target for a pasted address, or null if it isn't a web address. */
export function externalHref(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  try {
    // Anything without http(s) in front is read as a bare host name, so a
    // "javascript:" or "data:" address can never come out as a link.
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).href
  } catch {
    return null
  }
}
