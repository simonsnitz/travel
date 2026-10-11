import { addWord } from './myWords'
import type { SpellingIssue } from './useSpelling'
import { replaceWord } from './words'
import styles from './SpellingHints.module.css'

interface SpellingHintsProps {
  text: string
  issues: SpellingIssue[]
  /** Called with the corrected text when a suggestion is chosen. */
  onChange(text: string): void
  /** Called when a flagged word is chosen, so the editor can show where it is. */
  onLocate(word: string): void
}

/** More than this and the list pushes the next block off a phone's screen. The rest wait their turn. */
const MOST_SHOWN = 5

/**
 * The words in a paragraph that no dictionary recognises, each with corrections
 * to choose from. It sits under the text rather than in it, so it works the same
 * on every browser and phone, whether or not they underline misspellings themselves.
 */
export default function SpellingHints({ text, issues, onChange, onLocate }: SpellingHintsProps) {
  if (issues.length === 0) return null
  const shown = issues.slice(0, MOST_SHOWN)
  const waiting = issues.length - shown.length

  return (
    <div className={styles.spelling} role="group" aria-label="Possible spelling mistakes">
      <p className={styles.heading}>Check the spelling</p>
      <ul className={styles.list} role="list">
        {shown.map(({ word, suggestions }) => (
          <li key={word} className={styles.issue}>
            <button type="button" className={styles.word} onClick={() => onLocate(word)} aria-label={`Show “${word}” in the text`}>
              {word}
            </button>
            <span className={styles.fixes}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className={`btn btn-sm ${styles.fix}`}
                  onClick={() => onChange(replaceWord(text, word, suggestion))}
                  aria-label={`Replace “${word}” with “${suggestion}”`}
                >
                  {suggestion}
                </button>
              ))}
              <button
                type="button"
                className={`btn btn-sm btn-ghost ${styles.fix}`}
                onClick={() => addWord(word)}
                aria-label={`“${word}” is not a mistake`}
              >
                Not a mistake
              </button>
            </span>
          </li>
        ))}
      </ul>
      {waiting > 0 && <p className="hint">And {waiting} more.</p>}
    </div>
  )
}
