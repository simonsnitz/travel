import { parseVideoUrl } from '../../lib/embed'
import { newId } from '../../lib/media'
import type { Block, Photo, PhotosBlock, TextBlock } from '../../lib/types'

/**
 * A video block while it is being edited. Unlike the saved `VideoBlock`, it can
 * be empty or hold a half-typed link, and it remembers the link while the
 * "Upload a clip" tab is showing. `path` is only ever set when `source` is 'upload'.
 */
export interface VideoDraft {
  id: string
  type: 'video'
  source: 'upload' | 'embed'
  /** Storage path of the uploaded clip, or '' if there is none. */
  path: string
  /** The link as typed, valid or not. */
  url: string
  caption: string
}

/** A block as the editor holds it. Text and captions are kept exactly as typed. */
export type DraftBlock = TextBlock | PhotosBlock | VideoDraft

/** What gets saved for a day, apart from whether it is published. */
export interface Snapshot {
  location: string
  blocks: Block[]
}

/** What a day that has never been saved is compared against. */
const EMPTY_SNAPSHOT: Snapshot = { location: '', blocks: [] }

// ── Lists ─────────────────────────────────────────────────────────────────

/** Inserts `item` in front of the item with id `beforeId`, or at the end if there is no such item. */
export function insertBefore<T extends { id: string }>(items: T[], item: T, beforeId: string | null): T[] {
  const index = beforeId === null ? -1 : items.findIndex((candidate) => candidate.id === beforeId)
  if (index === -1) return [...items, item]
  return [...items.slice(0, index), item, ...items.slice(index)]
}

/** Moves the item at `index` by `delta` places. Returns the same array if it can't move. */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length || target === index) return items
  const next = [...items]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function moveBlock(blocks: DraftBlock[], id: string, delta: number): DraftBlock[] {
  return moveItem(
    blocks,
    blocks.findIndex((block) => block.id === id),
    delta,
  )
}

export function removeBlock(blocks: DraftBlock[], id: string): DraftBlock[] {
  return blocks.some((block) => block.id === id) ? blocks.filter((block) => block.id !== id) : blocks
}

/** Replaces the block with id `id` by `change(block)`. Returns the same array if nothing changed. */
export function updateBlock(blocks: DraftBlock[], id: string, change: (block: DraftBlock) => DraftBlock): DraftBlock[] {
  let changed = false
  const next = blocks.map((block) => {
    if (block.id !== id) return block
    const updated = change(block)
    if (updated !== block) changed = true
    return updated
  })
  return changed ? next : blocks
}

// ── New blocks ────────────────────────────────────────────────────────────

export const newTextBlock = (): TextBlock => ({ id: newId(), type: 'text', text: '' })
export const newPhotosBlock = (): PhotosBlock => ({ id: newId(), type: 'photos', photos: [] })
export const newVideoBlock = (): VideoDraft => ({ id: newId(), type: 'video', source: 'upload', path: '', url: '', caption: '' })

// ── Captions ──────────────────────────────────────────────────────────────

/** Sets a photo's caption as typed. An empty caption is left out rather than stored as ''. */
export function withCaption(photo: Photo, caption: string): Photo {
  const { caption: _previous, ...rest } = photo
  return caption === '' ? rest : { ...rest, caption }
}

const captionProp = (caption: string | undefined): { caption?: string } => {
  const trimmed = (caption ?? '').trim()
  return trimmed ? { caption: trimmed } : {}
}

// ── Draft ⇄ saved ─────────────────────────────────────────────────────────

/** True if deleting the block would lose something the owner typed or uploaded. */
export function hasContent(block: DraftBlock): boolean {
  if (block.type === 'text') return block.text.trim() !== ''
  if (block.type === 'photos') return block.photos.length > 0
  return block.path !== '' || block.url.trim() !== '' || block.caption.trim() !== ''
}

/**
 * The blocks as they would be saved: text and captions trimmed, and empty
 * blocks dropped (blank text, no photos, no clip and no valid link).
 */
export function toBlocks(drafts: DraftBlock[]): Block[] {
  const blocks: Block[] = []
  for (const draft of drafts) {
    if (draft.type === 'text') {
      const text = draft.text.trim()
      if (text) blocks.push({ id: draft.id, type: 'text', text })
    } else if (draft.type === 'photos') {
      if (draft.photos.length === 0) continue
      blocks.push({
        id: draft.id,
        type: 'photos',
        photos: draft.photos.map((photo) => ({
          path: photo.path,
          thumbPath: photo.thumbPath,
          width: photo.width,
          height: photo.height,
          ...captionProp(photo.caption),
        })),
      })
    } else if (draft.source === 'upload') {
      if (draft.path) {
        blocks.push({ id: draft.id, type: 'video', source: 'upload', path: draft.path, ...captionProp(draft.caption) })
      }
    } else {
      const url = draft.url.trim()
      if (parseVideoUrl(url)) {
        blocks.push({ id: draft.id, type: 'video', source: 'embed', url, ...captionProp(draft.caption) })
      }
    }
  }
  return blocks
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const str = (value: unknown): string => (typeof value === 'string' ? value : '')
const size = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1)

function toPhoto(value: unknown): Photo | null {
  if (!isRecord(value)) return null
  const path = str(value.path)
  if (!path) return null
  return withCaption(
    // A photo saved without a thumbnail still has its full-size image to show.
    { path, thumbPath: str(value.thumbPath) || path, width: size(value.width), height: size(value.height) },
    str(value.caption),
  )
}

function toDraft(value: unknown): DraftBlock | null {
  if (!isRecord(value)) return null
  const id = str(value.id) || newId()
  if (value.type === 'text') return { id, type: 'text', text: str(value.text) }
  if (value.type === 'photos') {
    const paths = new Set<string>()
    const photos: Photo[] = []
    for (const item of Array.isArray(value.photos) ? value.photos : []) {
      const photo = toPhoto(item)
      // Photos are told apart by their path, so a path can appear only once in a block.
      if (!photo || paths.has(photo.path)) continue
      paths.add(photo.path)
      photos.push(photo)
    }
    return photos.length > 0 ? { id, type: 'photos', photos } : null
  }
  if (value.type === 'video') {
    const path = str(value.path)
    const source = value.source === 'embed' || (value.source !== 'upload' && !path) ? 'embed' : 'upload'
    return {
      id,
      type: 'video',
      source,
      path: source === 'upload' ? path : '',
      url: str(value.url),
      caption: str(value.caption),
    }
  }
  return null
}

/**
 * Turns saved blocks, or blocks read back from a local backup, into editable
 * drafts. It is deliberately forgiving, because a backup can come from an older
 * version of the app: anything unrecognisable is dropped instead of throwing.
 */
export function toDrafts(value: unknown): DraftBlock[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const drafts: DraftBlock[] = []
  for (const item of value) {
    const draft = toDraft(item)
    if (!draft) continue
    // Ids are how uploads find their block, so each must be unique.
    if (ids.has(draft.id)) draft.id = newId()
    ids.add(draft.id)
    drafts.push(draft)
  }
  return drafts
}

// ── Stored media ──────────────────────────────────────────────────────────

/** Every stored file the blocks refer to, without duplicates. Embedded links have none. */
export function collectPaths(blocks: readonly (Block | DraftBlock)[]): string[] {
  const paths = new Set<string>()
  for (const block of blocks) {
    if (block.type === 'photos') {
      for (const photo of block.photos) {
        paths.add(photo.path)
        paths.add(photo.thumbPath)
      }
    } else if (block.type === 'video' && block.source === 'upload') {
      paths.add(block.path)
    }
  }
  paths.delete('')
  return [...paths]
}

/** The `candidates` that nothing in `keep` uses any more, without duplicates. */
export function stalePaths(candidates: Iterable<string>, keep: Iterable<string>): string[] {
  const kept = new Set(keep)
  const stale = new Set<string>()
  for (const path of candidates) if (path && !kept.has(path)) stale.add(path)
  return [...stale]
}

// ── Comparing ─────────────────────────────────────────────────────────────

// Built field by field so that key order and absent-versus-empty captions don't
// matter. Block ids are left out: they identify blocks on screen, not content.
function fingerprint(block: Block): unknown[] {
  if (block.type === 'text') return ['text', block.text]
  if (block.type === 'photos') {
    return ['photos', block.photos.map((photo) => [photo.path, photo.thumbPath, photo.width, photo.height, photo.caption ?? ''])]
  }
  return block.source === 'upload'
    ? ['video', 'upload', block.path, block.caption ?? '']
    : ['video', 'embed', block.url, block.caption ?? '']
}

/** True if saving `a` and saving `b` would store the same day. */
export function sameContent(a: Snapshot, b: Snapshot): boolean {
  if (a.location !== b.location || a.blocks.length !== b.blocks.length) return false
  return JSON.stringify(a.blocks.map(fingerprint)) === JSON.stringify(b.blocks.map(fingerprint))
}

/** What saving the draft would store. */
export function snapshotOf(location: string, drafts: DraftBlock[]): Snapshot {
  return { location: location.trim(), blocks: toBlocks(drafts) }
}

/** True if the draft differs from the last saved version (`null` when the day has never been saved). */
export function differsFromSaved(location: string, drafts: DraftBlock[], saved: Snapshot | null): boolean {
  return !sameContent(snapshotOf(location, drafts), saved ?? EMPTY_SNAPSHOT)
}
