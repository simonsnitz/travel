import type { CheckRequest, CheckResponse } from './spelling.worker'

// The page's side of the spell checker. The dictionaries live in a worker
// (spelling.worker.ts) that is only started the first time something is
// checked, so a visit to the editor that never touches a paragraph never
// downloads them.

type Misspelled = CheckResponse['misspelled']

/** What the dictionaries said about each word so far: its suggestions if misspelt, null if fine. */
const verdicts = new Map<string, string[] | null>()
const waiting = new Map<number, (misspelled: Misspelled | null) => void>()
const listeners = new Set<() => void>()
let worker: Worker | null = null
let unavailable = false
let nextId = 1

function giveUp() {
  // Without a spell checker the editor works exactly as before, so a failure here is silent.
  unavailable = true
  worker = null
  for (const answer of waiting.values()) answer(null)
  waiting.clear()
}

function start(): Worker | null {
  if (worker || unavailable) return worker
  try {
    worker = new Worker(new URL('./spelling.worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('message', (event: MessageEvent<CheckResponse>) => {
      waiting.get(event.data.id)?.(event.data.misspelled)
      waiting.delete(event.data.id)
    })
    worker.addEventListener('error', giveUp)
  } catch {
    giveUp()
  }
  listeners.forEach((listener) => listener())
  return worker
}

function ask(words: string[]): Promise<Misspelled | null> {
  const running = start()
  if (!running) return Promise.resolve(null)
  return new Promise((resolve) => {
    const request: CheckRequest = { id: nextId++, words }
    waiting.set(request.id, resolve)
    running.postMessage(request)
  })
}

export const spelling = {
  /** True once anything has been checked. From then on, checking more text costs nothing extra. */
  hasStarted: () => worker !== null || unavailable,

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /** The misspelt words among `words`, each with its suggested corrections. Empty if the checker can't run. */
  async check(words: string[]): Promise<Map<string, string[]>> {
    const unseen = words.filter((word) => !verdicts.has(word))
    if (unseen.length > 0) {
      const misspelled = await ask(unseen)
      if (misspelled) {
        const suggestions = new Map(misspelled.map((entry) => [entry.word, entry.suggestions]))
        for (const word of unseen) verdicts.set(word, suggestions.get(word) ?? null)
      }
    }
    const found = new Map<string, string[]>()
    for (const word of words) {
      const verdict = verdicts.get(word)
      if (verdict) found.set(word, verdict)
    }
    return found
  },
}
