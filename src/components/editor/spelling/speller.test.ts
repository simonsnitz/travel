import { beforeAll, describe, expect, it } from 'vitest'
import { DICTIONARIES } from './dictionaries'
import { createSpeller, type Speller } from './speller'
import { TRAVEL_WORDS } from './travelWords'

// These run against the real dictionaries, the same way the editor's worker does.
let speller: Speller

beforeAll(() => {
  speller = createSpeller(DICTIONARIES, TRAVEL_WORDS)
})

describe('createSpeller', () => {
  it('accepts ordinary words, contractions and capitalised sentence starts', () => {
    for (const word of ['the', 'receive', 'beautiful', "don't", "we'd", 'The', 'Monday', 'October']) {
      expect(speller.correct(word), word).toBe(true)
    }
  })

  it('accepts both American and British spellings', () => {
    for (const word of ['color', 'colour', 'traveled', 'travelled', 'organize', 'organise', 'center', 'centre', 'jewelry', 'jewellery']) {
      expect(speller.correct(word), word).toBe(true)
    }
  })

  it('knows the places and words a trip to India and Nepal is written with', () => {
    for (const word of ['Delhi', 'Varanasi', 'Jaipur', 'Agra', 'Kathmandu', 'Pokhara', 'Thamel', 'Bhaktapur', 'Rajasthan', 'Taj', 'Mahal', 'chai', 'momos', 'thali', 'ghats', 'namaste', 'stupa', 'wifi']) {
      expect(speller.correct(word), word).toBe(true)
    }
  })

  it('catches common slips and suggests the right word first', () => {
    const slips: Record<string, string> = {
      recieve: 'receive',
      beautifull: 'beautiful',
      definately: 'definitely',
      tommorow: 'tomorrow',
      accomodation: 'accommodation',
      seperate: 'separate',
      untill: 'until',
      begining: 'beginning',
      Varnasi: 'Varanasi',
      Katmandu: 'Kathmandu',
      delhi: 'Delhi',
    }
    for (const [slip, right] of Object.entries(slips)) {
      expect(speller.correct(slip), slip).toBe(false)
      expect(speller.suggest(slip)[0], slip).toBe(right)
    }
  })

  it('puts swapped letters right before anything else', () => {
    expect(speller.suggest('thier')[0]).toBe('their')
    expect(speller.suggest('wierd')[0]).toBe('weird')
    expect(speller.suggest('teh').slice(0, 2)).toContain('the')
    expect(speller.suggest('freind')[0]).toBe('friend')
  })

  it('offers a handful of suggestions at most, without repeats', () => {
    const suggestions = speller.suggest('thier')
    expect(suggestions).toContain('their')
    expect(suggestions.length).toBeLessThanOrEqual(4)
    expect(new Set(suggestions).size).toBe(suggestions.length)
  })

  it('has nothing to suggest for a word unlike any other', () => {
    expect(speller.correct('qwzxkvjq')).toBe(false)
    expect(speller.suggest('qwzxkvjq')).toEqual([])
  })
})
