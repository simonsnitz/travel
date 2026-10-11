import { describe, expect, it } from 'vitest'
import { distinctWords, findWord, replaceWord, tokenize } from './words'

const words = (text: string) => tokenize(text).map((token) => token.word)

describe('tokenize', () => {
  it('finds the words and where they are', () => {
    const text = 'We reached Varanasi at dawn.'
    expect(words(text)).toEqual(['We', 'reached', 'Varanasi', 'at', 'dawn'])
    for (const token of tokenize(text)) expect(text.slice(token.start, token.end)).toBe(token.word)
  })

  it('keeps contractions whole, with either kind of apostrophe', () => {
    expect(words("We didn't stop, and they’re fine")).toEqual(['We', "didn't", 'stop', 'and', "they're", 'fine'])
  })

  it('checks a possessive as the word it belongs to', () => {
    const text = "Thamel's streets and Simon’s bag"
    expect(words(text)).toEqual(['Thamel', 'streets', 'and', 'Simon', 'bag'])
    const [thamel] = tokenize(text)
    expect(text.slice(thamel.start, thamel.end)).toBe('Thamel')
  })

  it('splits hyphenated words into their parts', () => {
    expect(words('a well-known tuk-tuk')).toEqual(['well', 'known', 'tuk', 'tuk'])
  })

  it('leaves out what a dictionary cannot judge', () => {
    expect(words('See https://example.com/a-page or www.example.org, mail me@example.com')).toEqual(['See', 'or', 'mail'])
    expect(words('A 10km walk on the 3rd day, 5 hrs')).toEqual(['walk', 'on', 'the', 'day', 'hrs'])
    expect(words('Flew KTM to DEL with UNESCO')).toEqual(['Flew', 'to', 'with', 'UNESCO'])
    expect(words('I a x')).toEqual([])
  })

  it('checks accented words, and leaves other alphabets alone', () => {
    expect(words('café naïve नमस्ते 你好 привет')).toEqual(['café', 'naïve'])
  })
})

describe('distinctWords', () => {
  it('lists each word once, in order of first appearance', () => {
    expect(distinctWords('the cat and the hat and the cat')).toEqual(['the', 'cat', 'and', 'hat'])
  })
})

describe('replaceWord', () => {
  it('replaces every occurrence, but only whole words', () => {
    expect(replaceWord('I recieve what you recieve, recieved or not.', 'recieve', 'receive')).toBe(
      'I receive what you receive, recieved or not.',
    )
  })

  it('matches the exact spelling, so a capitalised slip is fixed on its own', () => {
    expect(replaceWord('Teh view. Not teh best.', 'Teh', 'The')).toBe('The view. Not teh best.')
  })

  it('keeps a possessive ending and any curly apostrophe in place', () => {
    expect(replaceWord('Varnasi’s ghats', 'Varnasi', 'Varanasi')).toBe('Varanasi’s ghats')
  })

  it('changes nothing when the word is not there', () => {
    expect(replaceWord('nothing to see', 'recieve', 'receive')).toBe('nothing to see')
  })
})

describe('findWord', () => {
  it('gives the position of the first occurrence', () => {
    expect(findWord('one two three two', 'two')).toEqual({ start: 4, end: 7 })
    expect(findWord('one two', 'four')).toBeNull()
  })
})
