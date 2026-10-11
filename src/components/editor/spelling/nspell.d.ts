// nspell ships no types. This covers the part of it used here.
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string): NSpell
  }
  export default function nspell(aff: string, dic: string): NSpell
}
