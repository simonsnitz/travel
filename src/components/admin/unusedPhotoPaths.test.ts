import { describe, expect, it } from 'vitest'
import type { Photo } from '../../lib/types'
import { unusedPhotoPaths } from './unusedPhotoPaths'

const photo = (name: string): Photo => ({ path: `${name}.jpg`, thumbPath: `${name}_thumb.jpg`, width: 4, height: 3 })

describe('unusedPhotoPaths', () => {
  it('lists both files of a photo that was replaced or removed', () => {
    expect(unusedPhotoPaths([photo('old')], photo('new'))).toEqual(['old.jpg', 'old_thumb.jpg'])
    expect(unusedPhotoPaths([photo('old')], null)).toEqual(['old.jpg', 'old_thumb.jpg'])
  })

  it('never lists a file of the photo that is kept', () => {
    expect(unusedPhotoPaths([photo('same')], photo('same'))).toEqual([])
    expect(unusedPhotoPaths([photo('draft'), photo('same')], photo('same'))).toEqual(['draft.jpg', 'draft_thumb.jpg'])
    const sharedThumb = { ...photo('old'), thumbPath: 'same_thumb.jpg' }
    expect(unusedPhotoPaths([sharedThumb], photo('same'))).toEqual(['old.jpg'])
  })

  it('lists each file once', () => {
    const single = { ...photo('one'), thumbPath: 'one.jpg' }
    expect(unusedPhotoPaths([single, single], null)).toEqual(['one.jpg'])
    expect(unusedPhotoPaths([], photo('new'))).toEqual([])
  })
})
