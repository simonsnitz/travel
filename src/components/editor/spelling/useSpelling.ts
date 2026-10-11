import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { spelling } from './client'
import { knowsWord, subscribeToWords, wordsVersion } from './myWords'
import { distinctWords } from './words'

export interface SpellingIssue {
  word: string
  suggestions: string[]
}

/**
 * Words that are right in this entry whatever the dictionaries think, in lower
 * case: the day's location and the trip's title, which are usually place names.
 */
export const SpellingContext = createContext<ReadonlySet<string>>(new Set())

/** Long enough that a word still being typed isn't reported half-finished. */
const PAUSE_MS = 600

/**
 * Checks the spelling of `text` a moment after it stops changing.
 *
 * `wanted` says the writer has shown interest in this text (they put the cursor
 * in it). Until some text is wanted, nothing is checked and the dictionaries
 * aren't downloaded. Once they are, every paragraph on the page is checked.
 */
export function useSpelling(text: string, wanted: boolean): { issues: SpellingIssue[]; checked: boolean } {
  // The third argument is the value when rendered outside a browser (the tests do this), where nothing has started.
  const started = useSyncExternalStore(spelling.subscribe, spelling.hasStarted, () => false)
  const accepted = useSyncExternalStore(subscribeToWords, wordsVersion, () => 0)
  const context = useContext(SpellingContext)
  const [result, setResult] = useState<{ text: string; issues: SpellingIssue[] } | null>(null)
  const active = wanted || started

  useEffect(() => {
    if (!active) return
    let current = true
    const timer = setTimeout(async () => {
      const found = await spelling.check(distinctWords(text))
      if (current) setResult({ text, issues: [...found].map(([word, suggestions]) => ({ word, suggestions })) })
    }, PAUSE_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [text, active])

  // Between a keystroke and the next check, the last findings stay on screen
  // rather than flickering away, minus any word that has since been fixed,
  // accepted, or deleted.
  const issues = useMemo(() => {
    if (!result) return []
    const present = new Set(distinctWords(text))
    return result.issues.filter(
      ({ word }) => present.has(word) && !knowsWord(word) && !context.has(word.toLowerCase()),
    )
    // `accepted` is here so that "Not a mistake" takes effect at once, in every paragraph.
  }, [result, text, context, accepted])

  return { issues, checked: result !== null && result.text === text }
}
