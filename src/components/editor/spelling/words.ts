/** A word found in a piece of text, ready to be looked up. */
export interface Token {
  /** The word as it is looked up: straight apostrophes, and no possessive ending. */
  word: string
  /** Where that word sits in the text. A possessive ending is left outside the range. */
  start: number
  end: number
}

// A word is a run of letters and digits, with apostrophes allowed inside it ("don't").
// Hyphens are not part of a word: "well-known" is checked as "well" and "known".
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu
/** Only words in the Latin alphabet can be checked against English dictionaries. */
const LATIN = /^[\p{Script=Latin}'’]+$/u
const LINK = /(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+/giu
const POSSESSIVE = /['’]s$/iu

/**
 * The words of a text that are worth checking. Left out, because an English
 * dictionary has nothing useful to say about them: web and email addresses,
 * anything with a digit in it ("10km", "3rd"), single letters, short
 * all-capitals abbreviations ("KTM"), and words in other alphabets.
 */
export function tokenize(text: string): Token[] {
  // Addresses are blanked out rather than removed, so every position still matches the original text.
  const readable = text.replace(LINK, (link) => ' '.repeat(link.length))
  const tokens: Token[] = []
  for (const match of readable.matchAll(WORD)) {
    let raw = match[0]
    if (/\p{N}/u.test(raw) || !LATIN.test(raw)) continue
    // "Thamel's" is checked, and corrected, as "Thamel". The same trims "it's" to "it", which does no harm.
    raw = raw.replace(POSSESSIVE, '')
    if (raw.length < 2) continue
    const allCapitals = raw === raw.toUpperCase() && raw !== raw.toLowerCase()
    if (allCapitals && raw.length <= 5) continue
    tokens.push({ word: raw.replaceAll('’', "'"), start: match.index, end: match.index + raw.length })
  }
  return tokens
}

/** Each different word of the text once, in the order they first appear. */
export function distinctWords(text: string): string[] {
  return [...new Set(tokenize(text).map((token) => token.word))]
}

/** The text with every occurrence of `word` (as a whole word) swapped for `replacement`. */
export function replaceWord(text: string, word: string, replacement: string): string {
  let result = text
  // Worked through from the end, so that earlier positions stay valid as the text changes length.
  for (const token of tokenize(text).reverse()) {
    if (token.word === word) result = result.slice(0, token.start) + replacement + result.slice(token.end)
  }
  return result
}

/** Where `word` first appears, for selecting it in the text box. */
export function findWord(text: string, word: string): { start: number; end: number } | null {
  const token = tokenize(text).find((candidate) => candidate.word === word)
  return token ? { start: token.start, end: token.end } : null
}
