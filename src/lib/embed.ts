export interface VideoEmbed {
  provider: 'youtube' | 'vimeo'
  /** URL for an <iframe src>. */
  embedUrl: string
  /** CSS `aspect-ratio` for the player. YouTube Shorts are vertical. */
  aspectRatio: '16 / 9' | '9 / 16'
}

/** Turns a pasted YouTube or Vimeo link into an embeddable player URL, or null if it isn't one. */
export function parseVideoUrl(input: string): VideoEmbed | null {
  const trimmed = input.trim()
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '')
  const parts = url.pathname.split('/').filter(Boolean)

  if (host === 'youtu.be') return youtube(parts[0])
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') return youtube(url.searchParams.get('v'))
    if (parts[0] === 'shorts') return youtube(parts[1], true)
    if (parts[0] === 'embed' || parts[0] === 'live') return youtube(parts[1])
    return null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const index = parts.findIndex((part) => /^\d+$/.test(part))
    if (index === -1) return null
    // Unlisted Vimeo videos carry a hash, as vimeo.com/<id>/<hash> or ?h=<hash>.
    const next = parts[index + 1] ?? ''
    const hash = url.searchParams.get('h') ?? (/^[0-9a-f]+$/i.test(next) ? next : null)
    const query = hash && /^[0-9a-f]+$/i.test(hash) ? `?h=${hash}` : ''
    return {
      provider: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${parts[index]}${query}`,
      aspectRatio: '16 / 9',
    }
  }
  return null
}

function youtube(id: string | null | undefined, vertical = false): VideoEmbed | null {
  if (!id || !/^[\w-]{11}$/.test(id)) return null
  return {
    provider: 'youtube',
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    aspectRatio: vertical ? '9 / 16' : '16 / 9',
  }
}
