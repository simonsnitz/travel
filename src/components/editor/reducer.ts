import type { Day, Photo } from '../../lib/types'
import {
  insertBefore,
  moveBlock,
  moveItem,
  removeBlock,
  snapshotOf,
  toDrafts,
  updateBlock,
  withCaption,
  type DraftBlock,
  type Snapshot,
  type VideoDraft,
} from './blocks'

/** A photo or clip that has been chosen but isn't stored yet, or whose upload failed. */
export interface PendingUpload {
  id: string
  /** The block the result belongs to. */
  blockId: string
  /** Where this file came in the order the owner chose files; later choices have higher numbers. */
  order: number
  kind: 'photo' | 'video'
  /** File name and size in bytes, for labels. */
  name: string
  size: number
  /** Object URL of the chosen photo, shown until the upload lands. '' for videos. */
  previewUrl: string
  status: 'queued' | 'uploading' | 'failed'
  /** 0 to 1. Only videos report progress. */
  progress: number
  /** Why the upload failed, or ''. */
  error: string
}

/** What to run again when the owner presses Retry. */
export type RetryAction = { action: 'save'; published: boolean } | { action: 'delete' }

export type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'deleting' }
  | { kind: 'failed'; message: string; retry: RetryAction }

export interface EditorState {
  location: string
  blocks: DraftBlock[]
  uploads: PendingUpload[]
  /** For photos uploaded during this visit, by path: the `order` of the upload each came from. */
  arrivals: Record<string, number>
  /** The version the server last confirmed, or null if this day has never been saved. */
  saved: Snapshot | null
  /** Whether the saved version is public. */
  published: boolean
  status: Status
}

export type EditorAction =
  | { type: 'locationChanged'; location: string }
  | { type: 'blockInserted'; block: DraftBlock; beforeId: string | null }
  | { type: 'blockMoved'; id: string; delta: -1 | 1 }
  | { type: 'blockRemoved'; id: string }
  | { type: 'textChanged'; id: string; text: string }
  | { type: 'photoRemoved'; blockId: string; path: string }
  | { type: 'photoMoved'; blockId: string; path: string; delta: -1 | 1 }
  | { type: 'photoCaptionChanged'; blockId: string; path: string; caption: string }
  | { type: 'videoChanged'; id: string; change: Partial<Pick<VideoDraft, 'source' | 'url' | 'caption'>> }
  | { type: 'videoCleared'; id: string }
  | { type: 'uploadQueued'; upload: PendingUpload }
  | { type: 'uploadStarted'; id: string }
  | { type: 'uploadProgress'; id: string; progress: number }
  | { type: 'uploadFailed'; id: string; error: string }
  | { type: 'uploadRetried'; id: string }
  | { type: 'uploadDropped'; id: string }
  | { type: 'photoUploaded'; id: string; photo: Photo }
  | { type: 'videoUploaded'; id: string; path: string }
  | { type: 'saveStarted' }
  | { type: 'saveSucceeded'; saved: Snapshot; published: boolean }
  | { type: 'saveFailed'; message: string; published: boolean }
  | { type: 'deleteStarted' }
  | { type: 'deleteFailed'; message: string }
  | { type: 'restored'; location: string; blocks: DraftBlock[] }

export function initialState(day: Day | null): EditorState {
  const blocks = toDrafts(day?.blocks)
  return {
    location: day?.location ?? '',
    blocks,
    uploads: [],
    arrivals: {},
    // Run through the same clean-up as a save, so an untouched day never counts as changed.
    saved: day ? snapshotOf(day.location, blocks) : null,
    published: day?.published ?? false,
    status: { kind: 'idle' },
  }
}

/** True while something is uploading or waiting to. Failed uploads don't count: they wait for the owner. */
export function isUploading(state: EditorState): boolean {
  return state.uploads.some((upload) => upload.status !== 'failed')
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'locationChanged':
      return { ...state, location: action.location }

    case 'blockInserted':
      if (state.blocks.some((block) => block.id === action.block.id)) return state
      return { ...state, blocks: insertBefore(state.blocks, action.block, action.beforeId) }

    case 'blockMoved':
      return withBlocks(state, moveBlock(state.blocks, action.id, action.delta))

    case 'blockRemoved':
      return {
        ...state,
        blocks: removeBlock(state.blocks, action.id),
        uploads: state.uploads.filter((upload) => upload.blockId !== action.id),
      }

    case 'textChanged':
      return withBlocks(
        state,
        updateBlock(state.blocks, action.id, (block) => (block.type === 'text' ? { ...block, text: action.text } : block)),
      )

    case 'photoRemoved':
      return withoutEmptyPhotoBlocks(
        withBlocks(
          state,
          updateBlock(state.blocks, action.blockId, (block) =>
            block.type === 'photos' ? { ...block, photos: block.photos.filter((photo) => photo.path !== action.path) } : block,
          ),
        ),
      )

    case 'photoMoved':
      return withBlocks(
        state,
        updateBlock(state.blocks, action.blockId, (block) => {
          if (block.type !== 'photos') return block
          const index = block.photos.findIndex((photo) => photo.path === action.path)
          const photos = moveItem(block.photos, index, action.delta)
          return photos === block.photos ? block : { ...block, photos }
        }),
      )

    case 'photoCaptionChanged':
      return withBlocks(
        state,
        updateBlock(state.blocks, action.blockId, (block) =>
          block.type === 'photos'
            ? { ...block, photos: block.photos.map((photo) => (photo.path === action.path ? withCaption(photo, action.caption) : photo)) }
            : block,
        ),
      )

    case 'videoChanged':
      return withBlocks(
        state,
        updateBlock(state.blocks, action.id, (block) => {
          if (block.type !== 'video') return block
          // A block holding a clip stays on the upload tab; the clip has to be removed first.
          const source = block.path ? 'upload' : (action.change.source ?? block.source)
          return { ...block, ...action.change, source }
        }),
      )

    case 'videoCleared':
      return withBlocks(
        state,
        updateBlock(state.blocks, action.id, (block) => (block.type === 'video' ? { ...block, path: '' } : block)),
      )

    case 'uploadQueued': {
      const { upload } = action
      const block = state.blocks.find((candidate) => candidate.id === upload.blockId)
      if (!block || block.type !== (upload.kind === 'photo' ? 'photos' : 'video')) return state
      // A video block holds one clip, so a new choice replaces whatever was pending.
      const others = upload.kind === 'video' ? state.uploads.filter((other) => other.blockId !== upload.blockId) : state.uploads
      return { ...state, uploads: [...others.filter((other) => other.id !== upload.id), upload] }
    }

    case 'uploadStarted':
      return withUpload(state, action.id, (upload) => ({ ...upload, status: 'uploading', progress: 0, error: '' }))

    case 'uploadProgress':
      return withUpload(state, action.id, (upload) =>
        upload.status === 'uploading' ? { ...upload, progress: Math.min(1, Math.max(0, action.progress)) } : upload,
      )

    case 'uploadFailed':
      return withUpload(state, action.id, (upload) => ({ ...upload, status: 'failed', error: action.error }))

    case 'uploadRetried':
      return withUpload(state, action.id, (upload) => ({ ...upload, status: 'queued', progress: 0, error: '' }))

    case 'uploadDropped':
      if (!state.uploads.some((upload) => upload.id === action.id)) return state
      return withoutEmptyPhotoBlocks({ ...state, uploads: state.uploads.filter((upload) => upload.id !== action.id) })

    case 'photoUploaded': {
      // The block may have been deleted, or the upload removed, while the photo
      // was on its way. Then there is nowhere to put it and the result is ignored.
      const upload = state.uploads.find((candidate) => candidate.id === action.id)
      if (!upload) return state
      const uploads = state.uploads.filter((candidate) => candidate.id !== action.id)
      const blocks = updateBlock(state.blocks, upload.blockId, (block) => {
        if (block.type !== 'photos' || block.photos.some((photo) => photo.path === action.photo.path)) return block
        // Uploads finish in any order. The photo goes in front of those that were
        // chosen after it, so the block ends up in the order the owner picked.
        const index = block.photos.findIndex((photo) => (state.arrivals[photo.path] ?? -1) > upload.order)
        const at = index === -1 ? block.photos.length : index
        return { ...block, photos: [...block.photos.slice(0, at), action.photo, ...block.photos.slice(at)] }
      })
      const arrivals = { ...state.arrivals, [action.photo.path]: upload.order }
      return withoutEmptyPhotoBlocks({ ...state, uploads, blocks, arrivals })
    }

    case 'videoUploaded': {
      const upload = state.uploads.find((candidate) => candidate.id === action.id)
      if (!upload) return state
      const uploads = state.uploads.filter((candidate) => candidate.id !== action.id)
      const blocks = updateBlock(state.blocks, upload.blockId, (block) =>
        block.type === 'video' ? { ...block, source: 'upload', path: action.path, url: '' } : block,
      )
      return { ...state, uploads, blocks }
    }

    case 'saveStarted':
      return { ...state, status: { kind: 'saving' } }

    case 'saveSucceeded':
      return { ...state, saved: action.saved, published: action.published, status: { kind: 'idle' } }

    case 'saveFailed':
      // Everything else stays exactly as it was, so nothing typed is lost.
      return { ...state, status: { kind: 'failed', message: action.message, retry: { action: 'save', published: action.published } } }

    case 'deleteStarted':
      return { ...state, status: { kind: 'deleting' } }

    case 'deleteFailed':
      return { ...state, status: { kind: 'failed', message: action.message, retry: { action: 'delete' } } }

    case 'restored':
      return { ...state, location: action.location, blocks: action.blocks, uploads: [], status: { kind: 'idle' } }
  }
}

const withBlocks = (state: EditorState, blocks: DraftBlock[]): EditorState =>
  blocks === state.blocks ? state : { ...state, blocks }

function withUpload(state: EditorState, id: string, change: (upload: PendingUpload) => PendingUpload): EditorState {
  if (!state.uploads.some((upload) => upload.id === id)) return state
  return { ...state, uploads: state.uploads.map((upload) => (upload.id === id ? change(upload) : upload)) }
}

// A photos block exists only while it has photos or uploads on their way, so
// the owner never sees an empty one.
function withoutEmptyPhotoBlocks(state: EditorState): EditorState {
  const isEmpty = (block: DraftBlock) =>
    block.type === 'photos' && block.photos.length === 0 && !state.uploads.some((upload) => upload.blockId === block.id)
  return state.blocks.some(isEmpty) ? { ...state, blocks: state.blocks.filter((block) => !isEmpty(block)) } : state
}
