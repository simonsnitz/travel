import type { Photo } from '../../lib/types'

/**
 * Storage paths that can be deleted once `kept` is the photo in use: every file
 * of every candidate, except any file the kept photo is made of.
 */
export function unusedPhotoPaths(candidates: Photo[], kept: Photo | null): string[] {
  const inUse = new Set(kept ? [kept.path, kept.thumbPath] : [])
  const paths = candidates.flatMap((photo) => [photo.path, photo.thumbPath])
  return [...new Set(paths)].filter((path) => !inUse.has(path))
}
