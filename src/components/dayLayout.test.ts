import { describe, expect, it } from 'vitest'
import type { Block, Photo } from '../lib/types'
import { blockHasContent, externalHref, photoAlt, splitParagraphs, tileShape } from './dayLayout'

const photo = (caption?: string): Photo => ({
  path: 'a.jpg',
  thumbPath: 'a_thumb.jpg',
  width: 1200,
  height: 900,
  caption,
})

describe('splitParagraphs', () => {
  it('splits at blank lines and keeps single line breaks', () => {
    expect(splitParagraphs('One.\n\nTwo,\nstill two.\n\n\n\nThree.')).toEqual(['One.', 'Two,\nstill two.', 'Three.'])
  })

  it('treats lines of spaces as blank and handles Windows line endings', () => {
    expect(splitParagraphs('One.\r\n   \r\nTwo.')).toEqual(['One.', 'Two.'])
  })

  it('drops empty paragraphs', () => {
    expect(splitParagraphs('\n\n  First.  \n\n')).toEqual(['First.'])
    expect(splitParagraphs('  \n \n')).toEqual([])
  })
})

describe('tileShape', () => {
  // Width of one photo, as a fraction of a row, in each of the two layouts.
  const narrow = (count: number, index: number) => (tileShape(count, index).lead ? 1 : 1 / 2)
  const wide = (count: number, index: number) => (tileShape(count, index).half ? 1 / 2 : 1 / 3)

  it('fills every row, whatever the number of photos', () => {
    for (let count = 2; count <= 24; count++) {
      for (const width of [narrow, wide]) {
        let row = 0
        for (let index = 0; index < count; index++) {
          row += width(count, index)
          if (Math.abs(row - 1) < 1e-9) row = 0
          expect(row, `${count} photos overflow a row`).toBeLessThan(1)
        }
        expect(row, `${count} photos leave a gap`).toBe(0)
      }
    }
  })

  it('opens an odd set with one wide photo and leaves an even set alone', () => {
    expect(tileShape(3, 0).lead).toBe(true)
    expect(tileShape(3, 1).lead).toBe(false)
    expect(tileShape(4, 0).lead).toBe(false)
  })
})

describe('photoAlt', () => {
  it('prefers the caption, then the place', () => {
    expect(photoAlt(photo('Sunrise on the ghats'), 'Varanasi')).toBe('Sunrise on the ghats')
    expect(photoAlt(photo(), 'Varanasi')).toBe('Photo from Varanasi')
    expect(photoAlt(photo('  '), '  ')).toBe('Photo')
  })
})

describe('blockHasContent', () => {
  it('spots blocks that are still empty', () => {
    const empty: Block[] = [
      { id: '1', type: 'text', text: ' \n ' },
      { id: '2', type: 'photos', photos: [] },
      { id: '3', type: 'video', source: 'embed', url: ' ' },
      { id: '4', type: 'video', source: 'upload', path: '' },
    ]
    const filled: Block[] = [
      { id: '5', type: 'text', text: 'Hello.' },
      { id: '6', type: 'photos', photos: [photo()] },
      { id: '7', type: 'video', source: 'embed', url: 'https://example.com/clip' },
      { id: '8', type: 'video', source: 'upload', path: 'trip/day/clip.mp4' },
    ]
    expect(empty.map(blockHasContent)).toEqual([false, false, false, false])
    expect(filled.map(blockHasContent)).toEqual([true, true, true, true])
  })

  it('skips a kind of block it does not know', () => {
    expect(blockHasContent({ id: '9', type: 'map', place: 'Varanasi' } as unknown as Block)).toBe(false)
  })
})

describe('externalHref', () => {
  it('accepts web addresses, with or without the scheme', () => {
    expect(externalHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(externalHref('  example.com/clip ')).toBe('https://example.com/clip')
  })

  it('never produces a link that runs script', () => {
    for (const input of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'not a link', '']) {
      const href = externalHref(input)
      expect(href === null || /^https?:\/\//.test(href), input).toBe(true)
    }
  })
})
