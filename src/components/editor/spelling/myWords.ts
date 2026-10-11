// Words the owner has said are right ("Not a mistake"). They are kept on the
// device, like a browser's own "add to dictionary", and never flagged again.

const KEY = 'travel:spelling-words'
const listeners = new Set<() => void>()
let words = load()
let version = 0

function load(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((word): word is string => typeof word === 'string') : [])
  } catch {
    // Storage can be unavailable or hold something unexpected. Starting empty only means a word gets asked about again.
    return new Set()
  }
}

/** True if the word, or its lower-case form when it is merely capitalised, has been accepted. */
export function knowsWord(word: string): boolean {
  if (words.has(word)) return true
  // A word accepted as "chai" is also right as "Chai" at the start of a sentence.
  const lower = word.toLowerCase()
  return word === lower.charAt(0).toUpperCase() + lower.slice(1) && words.has(lower)
}

export function addWord(word: string): void {
  if (words.has(word)) return
  words = new Set(words).add(word)
  version++
  try {
    localStorage.setItem(KEY, JSON.stringify([...words]))
  } catch {
    // Still accepted for this visit.
  }
  listeners.forEach((listener) => listener())
}

/** For useSyncExternalStore: lets every open text block react when a word is accepted. */
export function subscribeToWords(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const wordsVersion = () => version
