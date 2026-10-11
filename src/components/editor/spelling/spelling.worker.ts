import { DICTIONARIES } from './dictionaries'
import { createSpeller, type Speller } from './speller'
import { TRAVEL_WORDS } from './travelWords'

// The spell checker lives in a worker for two reasons: the dictionaries are a
// megabyte of text that only the editor needs, and unpacking them takes a moment
// (a tenth of a second on a laptop, more on a phone) that would otherwise freeze
// the page mid-sentence.

export interface CheckRequest {
  id: number
  words: string[]
}

export interface CheckResponse {
  id: number
  /** The words that are not in any dictionary, each with its likeliest corrections. */
  misspelled: { word: string; suggestions: string[] }[]
}

// The page's own types describe a window, not a worker, so the two calls used here are spelled out.
const worker = self as unknown as {
  postMessage(message: CheckResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<CheckRequest>) => void): void
}

let speller: Speller | null = null

worker.addEventListener('message', (event) => {
  speller ??= createSpeller(DICTIONARIES, TRAVEL_WORDS)
  const checker = speller
  const { id, words } = event.data
  const misspelled = words
    .filter((word) => !checker.correct(word))
    .map((word) => ({ word, suggestions: checker.suggest(word) }))
  worker.postMessage({ id, misspelled })
})
