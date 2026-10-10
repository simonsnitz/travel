import { MAX_VIDEO_BYTES, PHOTO_MAX_EDGE, THUMB_MAX_EDGE } from '../config'
import type { ISODate } from './types'

/** Storage folder for a day's media, or for a trip's cover when `date` is omitted. */
export function mediaFolder(tripId: string, date?: ISODate): string {
  return `${tripId}/${date ?? 'cover'}`
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

// ── Photos ────────────────────────────────────────────────────────────────

export interface ProcessedPhoto {
  full: Blob
  thumb: Blob
  /** Pixel size of `full`. */
  width: number
  height: number
}

/**
 * Re-encodes a photo as two JPEGs: a full-size copy and a thumbnail. This keeps
 * uploads small enough for mobile data and, because the image is redrawn, drops
 * embedded metadata such as GPS coordinates.
 */
export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const { source, release } = await decodeImage(file)
  try {
    const full = await renderJpeg(source, PHOTO_MAX_EDGE, 0.82)
    const thumb = await renderJpeg(source, THUMB_MAX_EDGE, 0.78)
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
  } finally {
    release()
  }
}

type ImageSource = ImageBitmap | HTMLImageElement

async function decodeImage(file: File): Promise<{ source: ImageSource; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies the camera's rotation flag, so portraits stay upright.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, release: () => bitmap.close() }
    } catch {
      // Fall through: some browsers decode formats via <img> that createImageBitmap rejects.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(`Couldn't read "${file.name}". Try a JPEG or PNG instead.`)
  }
}

async function renderJpeg(source: ImageSource, maxEdge: number, quality: number) {
  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not process the photo.')
  // JPEG has no transparency; without a fill, transparent areas would turn black.
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('This browser could not process the photo.'))),
      'image/jpeg',
      quality,
    )
  })
  return { blob, width, height }
}

// ── Videos ────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm']

/** Throws a user-facing error if the file can't be uploaded as a video clip. */
export function assertVideoFile(file: File): void {
  const isVideo = file.type.startsWith('video/') || VIDEO_EXTENSIONS.includes(extensionOf(file.name))
  if (!isVideo) throw new Error(`"${file.name}" isn't a video file.`)
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `"${file.name}" is ${formatBytes(file.size)}. Uploaded clips can be at most ${formatBytes(MAX_VIDEO_BYTES)}; ` +
        'trim it, or put it on YouTube and paste the link instead.',
    )
  }
}

/** File extension and content type to store a video under. */
export function videoFormat(file: File): { extension: string; contentType: string } {
  const extension = extensionOf(file.name)
  if (extension === 'webm' || file.type === 'video/webm') return { extension: 'webm', contentType: 'video/webm' }
  // iPhone .mov clips are served as video/mp4: the container is close enough
  // that Chrome and Firefox play it, while they refuse "video/quicktime".
  return { extension: extension === 'mov' ? 'mov' : 'mp4', contentType: 'video/mp4' }
}

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name)
  return match ? match[1].toLowerCase() : ''
}
