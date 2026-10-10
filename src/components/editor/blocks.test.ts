import { describe, expect, it } from 'vitest'
import type { Block, Photo } from '../../lib/types'
import {
  collectPaths,
  differsFromSaved,
  hasContent,
  insertBefore,
  moveBlock,
  moveItem,
  newPhotosBlock,
  newTextBlock,
  newVideoBlock,
  removeBlock,
  sameContent,
  snapshotOf,
  stalePaths,
  toBlocks,
  toDrafts,
  updateBlock,
  withCaption,
  type DraftBlock,
  type VideoDraft,
} from './blocks'

const YOUTUBE = 'https://youtu.be/aqz-KE-bpKQ'

const photo = (name: string, caption?: string): Photo => ({
  path: `trip/2026-10-14/${name}.jpg`,
  thumbPath: `trip/2026-10-14/${name}_thumb.jpg`,
  width: 1600,
  height: 1200,
  ...(caption === undefined ? {} : { caption }),
})

const text = (id: string, value: string): DraftBlock => ({ id, type: 'text', text: value })
const photos = (id: string, ...items: Photo[]): DraftBlock => ({ id, type: 'photos', photos: items })
const video = (id: string, fields: Partial<VideoDraft> = {}): VideoDraft => ({
  id,
  type: 'video',
  source: 'upload',
  path: '',
  url: '',
  caption: '',
  ...fields,
})

const ids = (blocks: { id: string }[]) => blocks.map((block) => block.id)

describe('insertBefore', () => {
  const list = [text('a', ''), text('b', ''), text('c', '')]

  it('inserts in front of the named block', () => {
    expect(ids(insertBefore(list, text('x', ''), 'a'))).toEqual(['x', 'a', 'b', 'c'])
    expect(ids(insertBefore(list, text('x', ''), 'c'))).toEqual(['a', 'b', 'x', 'c'])
  })

  it('appends when there is no block to go in front of', () => {
    expect(ids(insertBefore(list, text('x', ''), null))).toEqual(['a', 'b', 'c', 'x'])
    // The block the control sat above may have been deleted in the meantime.
    expect(ids(insertBefore(list, text('x', ''), 'gone'))).toEqual(['a', 'b', 'c', 'x'])
    expect(ids(insertBefore([], text('x', ''), null))).toEqual(['x'])
  })

  it('leaves the original list alone', () => {
    insertBefore(list, text('x', ''), 'b')
    expect(ids(list)).toEqual(['a', 'b', 'c'])
  })
})

describe('moving', () => {
  const list = [text('a', ''), text('b', ''), text('c', '')]

  it('moves a block up or down by id', () => {
    expect(ids(moveBlock(list, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(ids(moveBlock(list, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(ids(list)).toEqual(['a', 'b', 'c'])
  })

  it('does nothing at the ends or for an unknown id', () => {
    expect(moveBlock(list, 'a', -1)).toBe(list)
    expect(moveBlock(list, 'c', 1)).toBe(list)
    expect(moveBlock(list, 'gone', 1)).toBe(list)
  })

  it('moves any item by index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b'])
    const same = ['a', 'b']
    expect(moveItem(same, 1, 1)).toBe(same)
    expect(moveItem(same, -1, 1)).toBe(same)
    expect(moveItem(same, 0, 0)).toBe(same)
  })
})

describe('removeBlock and updateBlock', () => {
  const list = [text('a', 'one'), text('b', 'two')]

  it('removes by id', () => {
    expect(ids(removeBlock(list, 'a'))).toEqual(['b'])
    expect(removeBlock(list, 'gone')).toBe(list)
  })

  it('changes only the named block', () => {
    const next = updateBlock(list, 'b', (block) => ({ ...block, text: 'changed' }) as DraftBlock)
    expect(next).toEqual([text('a', 'one'), text('b', 'changed')])
    expect(next[0]).toBe(list[0])
  })

  it('returns the same list when nothing changes', () => {
    expect(updateBlock(list, 'gone', (block) => ({ ...block }))).toBe(list)
    expect(updateBlock(list, 'a', (block) => block)).toBe(list)
  })
})

describe('new blocks', () => {
  it('start empty, with ids of their own', () => {
    const a = newTextBlock()
    const b = newTextBlock()
    expect(a).toEqual({ id: a.id, type: 'text', text: '' })
    expect(a.id).not.toBe(b.id)
    expect(newPhotosBlock().photos).toEqual([])
    expect(newVideoBlock()).toMatchObject({ type: 'video', source: 'upload', path: '', url: '', caption: '' })
  })
})

describe('withCaption', () => {
  it('stores the caption as typed', () => {
    expect(withCaption(photo('a'), 'Sunrise ')).toEqual({ ...photo('a'), caption: 'Sunrise ' })
  })

  it('leaves the property out when the caption is empty', () => {
    const cleared = withCaption(photo('a', 'Sunrise'), '')
    expect(cleared).toEqual(photo('a'))
    expect('caption' in cleared).toBe(false)
  })
})

describe('hasContent', () => {
  it('ignores whitespace and untouched blocks', () => {
    expect(hasContent(text('a', '  \n '))).toBe(false)
    expect(hasContent(text('a', 'hi'))).toBe(true)
    expect(hasContent(photos('a'))).toBe(false)
    expect(hasContent(photos('a', photo('p')))).toBe(true)
    expect(hasContent(video('a'))).toBe(false)
    expect(hasContent(video('a', { path: 'trip/clip.mp4' }))).toBe(true)
    expect(hasContent(video('a', { source: 'embed', url: 'half a li' }))).toBe(true)
    expect(hasContent(video('a', { caption: 'On the ghats' }))).toBe(true)
  })
})

describe('toBlocks', () => {
  it('trims text and drops blank text blocks', () => {
    expect(toBlocks([text('a', '  First.\n\nSecond.  \n\n'), text('b', ' \n\t '), text('c', '')])).toEqual([
      { id: 'a', type: 'text', text: 'First.\n\nSecond.' },
    ])
  })

  it('drops photo blocks without photos and tidies captions', () => {
    const blocks = toBlocks([photos('a'), photos('b', photo('one', '  Dawn  '), photo('two', '   '), photo('three'))])
    expect(blocks).toEqual([{ id: 'b', type: 'photos', photos: [photo('one', 'Dawn'), photo('two'), photo('three')] }])
    const saved = blocks[0] as Extract<Block, { type: 'photos' }>
    expect('caption' in saved.photos[1]).toBe(false)
    expect('caption' in saved.photos[2]).toBe(false)
  })

  it('keeps an uploaded clip and drops an upload block without one', () => {
    expect(toBlocks([video('a'), video('b', { path: 'trip/clip.mp4', caption: ' Rickshaw ' })])).toEqual([
      { id: 'b', type: 'video', source: 'upload', path: 'trip/clip.mp4', caption: 'Rickshaw' },
    ])
  })

  it('keeps a valid link and drops a missing or invalid one', () => {
    const blocks = toBlocks([
      video('a', { source: 'embed', url: `  ${YOUTUBE}  ` }),
      video('b', { source: 'embed', url: 'https://example.com/video' }),
      video('c', { source: 'embed', url: '' }),
    ])
    expect(blocks).toEqual([{ id: 'a', type: 'video', source: 'embed', url: YOUTUBE }])
    expect('caption' in blocks[0]).toBe(false)
  })

  it('saves what the visible tab holds, not a link left behind on the other one', () => {
    expect(toBlocks([video('a', { source: 'upload', url: YOUTUBE })])).toEqual([])
    expect(toBlocks([video('b', { source: 'upload', path: 'trip/clip.mp4', url: YOUTUBE })])).toEqual([
      { id: 'b', type: 'video', source: 'upload', path: 'trip/clip.mp4' },
    ])
  })

  it('keeps the order of what is left', () => {
    const blocks = toBlocks([text('a', 'one'), text('b', ''), photos('c', photo('p')), video('d'), text('e', 'two')])
    expect(ids(blocks)).toEqual(['a', 'c', 'e'])
  })
})

describe('toDrafts', () => {
  it('turns saved blocks into drafts and back without loss', () => {
    const saved: Block[] = [
      { id: 'a', type: 'text', text: 'Hello' },
      { id: 'b', type: 'photos', photos: [photo('one', 'Dawn'), photo('two')] },
      { id: 'c', type: 'video', source: 'upload', path: 'trip/clip.mp4', caption: 'Rickshaw' },
      { id: 'd', type: 'video', source: 'embed', url: YOUTUBE },
    ]
    const drafts = toDrafts(saved)
    expect(drafts[2]).toEqual(video('c', { path: 'trip/clip.mp4', caption: 'Rickshaw' }))
    expect(drafts[3]).toEqual(video('d', { source: 'embed', url: YOUTUBE }))
    expect(toBlocks(drafts)).toEqual(saved)
  })

  it('keeps drafts as they were, including half-finished ones', () => {
    const drafts: DraftBlock[] = [
      text('a', '  still typing '),
      video('b', { source: 'embed', url: 'youtu' }),
      video('c', { source: 'upload', path: 'trip/clip.mp4', url: YOUTUBE }),
    ]
    expect(toDrafts(JSON.parse(JSON.stringify(drafts)))).toEqual(drafts)
  })

  it('survives anything a stale or damaged backup might hold', () => {
    expect(toDrafts(undefined)).toEqual([])
    expect(toDrafts('nope')).toEqual([])
    expect(toDrafts({ blocks: [] })).toEqual([])
    expect(
      toDrafts([null, 42, 'text', {}, { id: 'x', type: 'map' }, { id: 'a', type: 'text' }, { id: 'b', type: 'text', text: 7 }]),
    ).toEqual([text('a', ''), text('b', '')])
  })

  it('drops photos it cannot use, and photo blocks left with none', () => {
    const drafts = toDrafts([
      { id: 'a', type: 'photos', photos: 'oops' },
      { id: 'b', type: 'photos', photos: [null, { thumbPath: 'no-path.jpg' }, { path: 'p.jpg' }, { path: 'p.jpg', caption: 'again' }] },
      { id: 'c', type: 'photos', photos: [{ path: 'q.jpg', thumbPath: 'q_t.jpg', width: 800, height: 600, caption: '' }] },
    ])
    expect(drafts).toEqual([
      // No thumbnail falls back to the full image; an unknown size becomes a harmless 1 × 1.
      { id: 'b', type: 'photos', photos: [{ path: 'p.jpg', thumbPath: 'p.jpg', width: 1, height: 1 }] },
      { id: 'c', type: 'photos', photos: [{ path: 'q.jpg', thumbPath: 'q_t.jpg', width: 800, height: 600 }] },
    ])
  })

  it('never puts a clip on the link tab', () => {
    expect(toDrafts([{ id: 'a', type: 'video', source: 'embed', url: YOUTUBE, path: 'trip/clip.mp4' }])).toEqual([
      video('a', { source: 'embed', url: YOUTUBE }),
    ])
    expect(toDrafts([{ id: 'b', type: 'video', path: 'trip/clip.mp4' }])).toEqual([video('b', { path: 'trip/clip.mp4' })])
    expect(toDrafts([{ id: 'c', type: 'video', url: YOUTUBE }])).toEqual([video('c', { source: 'embed', url: YOUTUBE })])
  })

  it('gives every block an id of its own', () => {
    const drafts = toDrafts([
      { id: 'a', type: 'text', text: 'one' },
      { id: 'a', type: 'text', text: 'two' },
      { type: 'text', text: 'three' },
      { id: '', type: 'text', text: 'four' },
    ])
    expect(drafts.map((draft) => (draft.type === 'text' ? draft.text : ''))).toEqual(['one', 'two', 'three', 'four'])
    expect(drafts[0].id).toBe('a')
    expect(new Set(ids(drafts)).size).toBe(4)
    expect(drafts.every((draft) => draft.id !== '')).toBe(true)
  })
})

describe('collectPaths', () => {
  it('lists the full image and thumbnail of every photo, and uploaded clips', () => {
    const blocks: Block[] = [
      { id: 'a', type: 'text', text: 'Hello' },
      { id: 'b', type: 'photos', photos: [photo('one'), photo('two')] },
      { id: 'c', type: 'video', source: 'upload', path: 'trip/clip.mp4' },
      { id: 'd', type: 'video', source: 'embed', url: YOUTUBE },
    ]
    expect(collectPaths(blocks).sort()).toEqual(
      [photo('one').path, photo('one').thumbPath, photo('two').path, photo('two').thumbPath, 'trip/clip.mp4'].sort(),
    )
  })

  it('lists each path once and skips empty ones', () => {
    const shared: Photo = { path: 'same.svg', thumbPath: 'same.svg', width: 10, height: 10 }
    expect(collectPaths([photos('a', shared), photos('b', shared), video('c')])).toEqual(['same.svg'])
  })

  it('works on drafts too', () => {
    expect(collectPaths([video('a', { path: 'trip/clip.mp4' }), video('b', { source: 'embed', url: YOUTUBE })])).toEqual([
      'trip/clip.mp4',
    ])
  })
})

describe('stalePaths', () => {
  it('returns what was stored or uploaded but is no longer used', () => {
    const previouslySaved = ['a.jpg', 'a_thumb.jpg', 'b.jpg', 'b_thumb.jpg']
    const uploadedThisVisit = ['c.jpg', 'c_thumb.jpg', 'd.mp4']
    const nowSaved = ['a.jpg', 'a_thumb.jpg', 'c.jpg', 'c_thumb.jpg']
    expect(stalePaths([...previouslySaved, ...uploadedThisVisit], nowSaved).sort()).toEqual(['b.jpg', 'b_thumb.jpg', 'd.mp4'])
  })

  it('returns nothing when everything is still used', () => {
    expect(stalePaths(['a.jpg'], ['a.jpg', 'b.jpg'])).toEqual([])
    expect(stalePaths([], ['a.jpg'])).toEqual([])
  })

  it('lists each path once and skips empty ones', () => {
    expect(stalePaths(['a.jpg', 'a.jpg', ''], [])).toEqual(['a.jpg'])
    expect(stalePaths(new Set(['a.jpg']), new Set<string>())).toEqual(['a.jpg'])
  })
})

describe('comparing with the saved version', () => {
  const saved = snapshotOf('Varanasi', [text('a', 'Hello'), photos('b', photo('one', 'Dawn')), video('c', { source: 'embed', url: YOUTUBE })])

  it('treats an untouched draft as saved', () => {
    expect(differsFromSaved('Varanasi', toDrafts(saved.blocks), saved)).toBe(false)
  })

  it('ignores differences that saving would remove', () => {
    const drafts = [
      text('a', '  Hello \n'),
      text('new', '   '),
      photos('b', photo('one', 'Dawn ')),
      video('c', { source: 'embed', url: ` ${YOUTUBE}` }),
      video('empty'),
    ]
    expect(differsFromSaved(' Varanasi ', drafts, saved)).toBe(false)
  })

  it('notices real changes', () => {
    const drafts = toDrafts(saved.blocks)
    expect(differsFromSaved('Sarnath', drafts, saved)).toBe(true)
    expect(differsFromSaved('Varanasi', [text('a', 'Hello!'), ...drafts.slice(1)], saved)).toBe(true)
    expect(differsFromSaved('Varanasi', drafts.slice(0, 2), saved)).toBe(true)
    expect(differsFromSaved('Varanasi', [drafts[1], drafts[0], drafts[2]], saved)).toBe(true)
    expect(differsFromSaved('Varanasi', [drafts[0], photos('b', photo('one', 'Dusk')), drafts[2]], saved)).toBe(true)
    expect(differsFromSaved('Varanasi', [drafts[0], photos('b', photo('one', 'Dawn'), photo('two')), drafts[2]], saved)).toBe(true)
  })

  it('compares a day that was never saved with an empty one', () => {
    expect(differsFromSaved('', [], null)).toBe(false)
    expect(differsFromSaved('  ', [text('a', ' '), video('b')], null)).toBe(false)
    expect(differsFromSaved('Delhi', [], null)).toBe(true)
    expect(differsFromSaved('', [text('a', 'Hello')], null)).toBe(true)
  })

  it('does not care about key order, block ids, or how an empty caption is spelled', () => {
    const a = { location: 'Delhi', blocks: [{ id: 'a', type: 'photos', photos: [{ ...photo('one'), caption: '' }] }] as Block[] }
    const reordered = { height: 1200, width: 1600, thumbPath: photo('one').thumbPath, path: photo('one').path }
    const b = { blocks: [{ photos: [reordered], type: 'photos', id: 'other-id' }] as Block[], location: 'Delhi' }
    expect(sameContent(a, b)).toBe(true)
  })

  it('tells an uploaded clip from a link', () => {
    const upload: Block[] = [{ id: 'a', type: 'video', source: 'upload', path: YOUTUBE }]
    const embed: Block[] = [{ id: 'a', type: 'video', source: 'embed', url: YOUTUBE }]
    expect(sameContent({ location: '', blocks: upload }, { location: '', blocks: embed })).toBe(false)
  })
})
