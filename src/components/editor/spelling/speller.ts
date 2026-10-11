import nspell from 'nspell'

/** A Hunspell dictionary: the affix rules and the word list, as text. */
export interface Dictionary {
  aff: string
  dic: string
}

export interface Speller {
  correct(word: string): boolean
  /** The likeliest corrections first. Empty if there is nothing close. */
  suggest(word: string): string[]
}

const MOST_SUGGESTIONS = 4

/**
 * Checks words against several dictionaries at once. A word is right if any of
 * them accepts it, which is how both "colour" and "color" pass: the checker is
 * here to catch slips, not to pick a side of the Atlantic.
 *
 * `extraWords` are accepted on top of what the dictionaries hold.
 */
export function createSpeller(dictionaries: Dictionary[], extraWords: string[] = []): Speller {
  const spellers = dictionaries.map(({ aff, dic }) => nspell(aff, dic))
  for (const speller of spellers) {
    for (const word of extraWords) speller.add(word)
  }

  const correct = (word: string) => spellers.some((speller) => speller.correct(word))

  return {
    correct,
    suggest(word) {
      const lists = spellers.map((speller) => speller.suggest(word))
      // Two neighbouring letters typed in the wrong order is the commonest slip of all ("teh",
      // "thier"), and the dictionaries rank it low or miss it, so those corrections go first.
      const merged = new Set<string>(swaps(word).filter(correct))
      // The rest are taken in turn from each dictionary, so the best idea of each comes before the second-best of any.
      for (let rank = 0; merged.size < MOST_SUGGESTIONS && lists.some((list) => rank < list.length); rank++) {
        for (const list of lists) {
          if (rank < list.length && merged.size < MOST_SUGGESTIONS) merged.add(list[rank])
        }
      }
      return [...merged].slice(0, MOST_SUGGESTIONS)
    },
  }
}

/** The word with each pair of neighbouring letters swapped in turn. */
function swaps(word: string): string[] {
  const swapped: string[] = []
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] !== word[i + 1]) swapped.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2))
  }
  return swapped
}
