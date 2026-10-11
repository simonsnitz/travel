// The dictionary packages only export a Node loader (it reads the files from
// disk), so the files themselves are imported here as text, by path.
import americanAff from '../../../../node_modules/dictionary-en/index.aff?raw'
import americanDic from '../../../../node_modules/dictionary-en/index.dic?raw'
import britishAff from '../../../../node_modules/dictionary-en-gb/index.aff?raw'
import britishDic from '../../../../node_modules/dictionary-en-gb/index.dic?raw'
import type { Dictionary } from './speller'

/** American and British English. Either spelling of a word is accepted. */
export const DICTIONARIES: Dictionary[] = [
  { aff: americanAff, dic: americanDic },
  { aff: britishAff, dic: britishDic },
]
