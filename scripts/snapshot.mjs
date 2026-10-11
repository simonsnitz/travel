#!/usr/bin/env node
// Copies everything that is published into a folder of plain files: the backup
// copy that the site serves to readers when the database can't be reached.
//
//   node scripts/snapshot.mjs <folder> [--allow-empty]
//
// It reads the database the way any visitor can (with the publishable key from
// .env.production), so drafts are never copied. Photos and clips are downloaded
// once and kept; files nothing refers to any more are removed from the folder.
//
// Exit codes: 0 done, 1 something is wrong, 2 the database could not be reached
// (the folder is left as it was), 3 refused because the copy would be emptied.

import { createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { buildSnapshot, parseEnv, wouldEmpty } from './snapshot-lib.mjs'

const UNREACHABLE = 2
const REFUSED = 3
const PAGE = 1000

const README = `# Backup copy

This branch is written by the Deploy workflow. It holds a copy of everything
that is published on the site:

- \`index.json\`, \`days/\`, \`day/\`: the trips and their published days
- \`media/\`: their photos and clips

The site serves this copy to readers whenever the database can't be reached.
Don't edit it by hand: the next run overwrites it from the database.
`

class Unreachable extends Error {}

const [folder = 'snapshot', ...flags] = process.argv.slice(2)
const allowEmpty = flags.includes('--allow-empty')

const settings = { ...parseEnv(await readFile('.env.production', 'utf8').catch(() => '')), ...process.env }
const url = (settings.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
const key = settings.VITE_SUPABASE_KEY ?? ''
if (!url || !key) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_KEY are not set (see .env.production).')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A response, after up to three tries. A server error counts as unreachable: a paused project answers with one. */
async function request(address, init = {}, timeoutMs = 60_000) {
  let problem
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(address, { ...init, signal: AbortSignal.timeout(timeoutMs) })
      if (response.status < 500) return response
      problem = new Error(`the server answered ${response.status}`)
    } catch (error) {
      problem = error
    }
    if (attempt < 3) await sleep(attempt * 3000)
  }
  throw new Unreachable(problem?.message ?? String(problem))
}

/** Every row a query returns, fetched a page at a time. */
async function rows(query) {
  const all = []
  for (let offset = 0; ; offset += PAGE) {
    const response = await request(`${url}/rest/v1/${query}&limit=${PAGE}&offset=${offset}`, { headers: { apikey: key } })
    if (!response.ok) {
      throw new Error(`The database answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    const page = await response.json()
    all.push(...page)
    if (page.length < PAGE) return all
  }
}

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  )

/** Downloads one stored file. Returns false if storage no longer has it. */
async function download(storagePath, target) {
  const address = `${url}/storage/v1/object/public/media/${storagePath.split('/').map(encodeURIComponent).join('/')}`
  const response = await request(address, {}, 5 * 60_000)
  if (!response.ok || !response.body) return false
  await mkdir(path.dirname(target), { recursive: true })
  // Written under another name first, so a file cut short is never mistaken for a finished one.
  const partial = `${target}.partial`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
  await rename(partial, target)
  return true
}

/** Runs `work` over `items`, a few at a time. */
async function inParallel(items, limit, work) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) await work(queue.shift())
  })
  await Promise.all(workers)
}

/** Every file under `root`, as paths relative to it with forward slashes. Git's own folder is left alone. */
async function filesUnder(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])
  const found = []
  for (const entry of entries) {
    if (relative === '' && entry.name === '.git') continue
    const name = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...(await filesUnder(root, name)))
    else found.push(name)
  }
  return found
}

async function removeEmptyFolders(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || (relative === '' && entry.name === '.git')) continue
    await removeEmptyFolders(root, relative ? `${relative}/${entry.name}` : entry.name)
  }
  // rmdir only succeeds on an empty folder, which is exactly the test wanted.
  if (relative !== '') await rmdir(path.join(root, relative)).catch(() => {})
}

async function previousCounts() {
  try {
    const index = JSON.parse(await readFile(path.join(folder, 'index.json'), 'utf8'))
    return { trips: Array.isArray(index.trips) ? index.trips.length : 0, days: Number(index.days) || 0 }
  } catch {
    return null
  }
}

try {
  const tripRows = await rows('trips?select=*&order=start_date.desc,created_at.desc')
  const dayRows = await rows('days?select=*&published=eq.true&order=trip_id,date')
  const next = buildSnapshot(tripRows, dayRows)

  if (!allowEmpty && wouldEmpty(await previousCounts(), next.counts)) {
    console.error(
      'The database returned no trips or no published days, but the backup copy has some. ' +
        'The copy has been left untouched. If everything really was deleted, run this again with --allow-empty.',
    )
    process.exit(REFUSED)
  }

  // Photos and clips first: if one can't be fetched the run stops here, before any
  // page in the copy is changed to point at a file that isn't there yet.
  let downloaded = 0
  const gone = []
  await inParallel(next.media, 4, async (storagePath) => {
    const target = path.join(folder, 'media', storagePath)
    // A stored file is never rewritten (every upload gets a new name), so one copy is enough for good.
    if (await exists(target)) return
    if (await download(storagePath, target)) downloaded++
    else gone.push(storagePath)
  })

  let written = 0
  for (const [name, text] of next.files) {
    const target = path.join(folder, name)
    if ((await readFile(target, 'utf8').catch(() => null)) === text) continue
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text)
    written++
  }
  if (!(await exists(path.join(folder, 'README.md')))) await writeFile(path.join(folder, 'README.md'), README)

  // Whatever the copy no longer needs goes: unpublished or deleted days, and files nothing refers to.
  const keep = new Set(['README.md', ...next.files.keys(), ...next.media.map((storagePath) => `media/${storagePath}`)])
  let removed = 0
  for (const name of await filesUnder(folder)) {
    if (keep.has(name)) continue
    await rm(path.join(folder, name))
    removed++
  }
  await removeEmptyFolders(folder)

  console.log(
    `Backup copy: ${next.counts.trips} trip(s), ${next.counts.days} published day(s), ${next.media.length} photo and clip file(s). ` +
      `${written} page file(s) updated, ${downloaded} file(s) downloaded, ${removed} removed.`,
  )
  for (const storagePath of gone) console.warn(`Missing from storage, so not copied: ${storagePath}`)
  for (const storagePath of next.skipped) console.warn(`Not a plain file path, so not copied: ${storagePath}`)
} catch (error) {
  if (error instanceof Unreachable) {
    console.error(`The database could not be reached (${error.message}). The backup copy has been left as it was.`)
    process.exit(UNREACHABLE)
  }
  throw error
}
