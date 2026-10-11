import { describe, expect, it, vi } from 'vitest'
import { fitToBudget } from './media'

/** A stand-in encoder whose file size depends on the settings it is given. */
const encoder = (sizeOf: (maxEdge: number, quality: number) => number) =>
  vi.fn(async (maxEdge: number, quality: number) => ({ blob: { size: sizeOf(maxEdge, quality) }, maxEdge, quality }))

describe('fitToBudget', () => {
  it('keeps the first attempt when it fits, which is the usual case', async () => {
    const encode = encoder(() => 400_000)
    const result = await fitToBudget(encode, 1600, 0.8, 850_000)
    expect(result).toMatchObject({ maxEdge: 1600, quality: 0.8 })
    expect(encode).toHaveBeenCalledTimes(1)
  })

  it('lowers the quality first, leaving the size of the picture alone', async () => {
    // Fits once the quality reaches 0.64.
    const encode = encoder((_, quality) => (quality > 0.64 ? 1_200_000 : 800_000))
    const result = await fitToBudget(encode, 1600, 0.8, 850_000)
    expect(result).toMatchObject({ maxEdge: 1600, quality: 0.64 })
    expect(encode.mock.calls).toEqual([
      [1600, 0.8],
      [1600, 0.72],
      [1600, 0.64],
    ])
  })

  it('shrinks the picture only once the quality is as low as it goes', async () => {
    // Size follows the pixel count, and nothing fits until the edge is under 1200.
    const encode = encoder((maxEdge) => (maxEdge >= 1200 ? 2_000_000 : 700_000))
    const result = await fitToBudget(encode, 1600, 0.8, 850_000)
    expect(result).toMatchObject({ maxEdge: 1156, quality: 0.5 })
    expect(encode.mock.calls.map(([maxEdge, quality]) => `${maxEdge}@${quality}`)).toEqual([
      '1600@0.8',
      '1600@0.72',
      '1600@0.64',
      '1600@0.56',
      '1600@0.5',
      '1360@0.5',
      '1156@0.5',
    ])
  })

  it('stops at the floor rather than looping, even if the file still does not fit', async () => {
    const encode = encoder(() => 5_000_000)
    const result = await fitToBudget(encode, 1600, 0.8, 850_000)
    expect(result).toMatchObject({ maxEdge: 480, quality: 0.5 })
    expect(encode.mock.calls.length).toBeLessThan(20)
  })

  it('holds a thumbnail to its own, smaller budget', async () => {
    const encode = encoder((_, quality) => (quality > 0.6 ? 140_000 : 90_000))
    expect(await fitToBudget(encode, 720, 0.72, 100_000)).toMatchObject({ maxEdge: 720, quality: 0.56 })
  })
})
