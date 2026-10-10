import { describe, expect, it } from 'vitest'
import { parseVideoUrl } from './embed'

const YT = 'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ'

describe('parseVideoUrl', () => {
  it('recognises YouTube links in their common shapes', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=42s',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ?si=abc123',
      'youtu.be/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube.com/live/aqz-KE-bpKQ',
      '  https://www.youtube.com/watch?v=aqz-KE-bpKQ  ',
    ]) {
      expect(parseVideoUrl(url), url).toEqual({ provider: 'youtube', embedUrl: YT, aspectRatio: '16 / 9' })
    }
  })

  it('treats Shorts as vertical', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/aqz-KE-bpKQ')).toEqual({
      provider: 'youtube',
      embedUrl: YT,
      aspectRatio: '9 / 16',
    })
  })

  it('recognises Vimeo links, including unlisted ones', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871')?.embedUrl).toBe('https://player.vimeo.com/video/76979871')
    expect(parseVideoUrl('https://vimeo.com/76979871/abc123def0')?.embedUrl).toBe(
      'https://player.vimeo.com/video/76979871?h=abc123def0',
    )
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abc123def0')?.embedUrl).toBe(
      'https://player.vimeo.com/video/76979871?h=abc123def0',
    )
  })

  it('rejects everything else', () => {
    for (const url of [
      '',
      'not a link',
      'https://example.com/watch?v=aqz-KE-bpKQ',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/@somechannel',
      'https://vimeo.com/channels/staffpicks',
      'https://evil.example/?u=https://youtu.be/aqz-KE-bpKQ',
    ]) {
      expect(parseVideoUrl(url), url).toBeNull()
    }
  })
})
