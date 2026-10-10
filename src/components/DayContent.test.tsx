import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Block, Photo } from '../lib/types'
import DayContent from './DayContent'

vi.mock('../lib/store', () => ({ store: { mediaUrl: (path: string) => `https://media.test/${path}` } }))

const photo = (name: string, caption?: string): Photo => ({
  path: `${name}.jpg`,
  thumbPath: `${name}_thumb.jpg`,
  width: 1600,
  height: 1000,
  caption,
})

function render(blocks: Block[], location = 'Varanasi', date = '2026-10-14') {
  const html = renderToStaticMarkup(<DayContent tripStart="2026-10-07" day={{ date, location, blocks }} />)
  const tags = (name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []
  return { html, tags, text: html.replace(/<[^>]+>/g, '') }
}

describe('DayContent', () => {
  it('heads the day with its number, weekday, date and place', () => {
    const { html, text } = render([])
    expect(text).toContain('Day 8 · Wednesday')
    expect(html).toMatch(/<h1[^>]*>October 14<span[^>]*>\u00a0· <\/span>Varanasi<\/h1>/)
    expect(text).toContain('Nothing written for this day yet.')
  })

  it('shows only the date when there is no place', () => {
    expect(render([], '  ').html).toMatch(/<h1[^>]*>October 14<\/h1>/)
  })

  it('survives a date that is not one', () => {
    expect(render([], 'Varanasi', 'soon').html).toMatch(/<h1[^>]*>Varanasi<\/h1>/)
  })

  it('renders text as paragraphs of plain text', () => {
    const { html, tags, text } = render([{ id: 'a', type: 'text', text: 'First.\n\nSecond <b>bold</b>\nline.' }])
    expect(tags('p')).toHaveLength(3) // the eyebrow and two paragraphs
    expect(html).toContain('Second &lt;b&gt;bold&lt;/b&gt;\nline.')
    expect(html).not.toContain('<b>')
    expect(text).not.toContain('Nothing written')
  })

  it('leaves out blocks that are empty or of a kind it does not know', () => {
    const { text, tags } = render([
      { id: 'a', type: 'text', text: '  ' },
      { id: 'b', type: 'photos', photos: [] },
      { id: 'c', type: 'map', place: 'Varanasi' } as unknown as Block,
    ])
    expect(tags('div')).toHaveLength(0)
    expect(text).toContain('Nothing written for this day yet.')
  })

  it('shows one photo large, from the full-size file', () => {
    const { tags, html } = render([{ id: 'a', type: 'photos', photos: [photo('one', 'On the ghats')] }])
    const [img] = tags('img')
    expect(img).toContain('src="https://media.test/one.jpg"')
    expect(img).toContain('alt="On the ghats"')
    expect(img).toContain('width="1600"')
    expect(img).toContain('height="1000"')
    expect(img).toContain('loading="lazy"')
    expect(img).toContain('decoding="async"')
    expect(html).toContain('--ratio:1.6')
    expect(html).toMatch(/<figcaption[^>]*>On the ghats<\/figcaption>/)
  })

  it('shows several photos as a grid of thumbnails', () => {
    const { tags } = render([{ id: 'a', type: 'photos', photos: [photo('one'), photo('two'), photo('three')] }])
    const images = tags('img')
    expect(images).toHaveLength(3)
    expect(images[1]).toContain('src="https://media.test/two_thumb.jpg"')
    expect(images[1]).toContain('alt="Photo from Varanasi"')
    expect(tags('button')).toHaveLength(3)
    expect(tags('figcaption')).toHaveLength(0)
  })

  it('plays an uploaded clip inline, starting from its first frame', () => {
    const { tags } = render([{ id: 'a', type: 'video', source: 'upload', path: 'clip.mp4', caption: 'Evening aarti' }])
    const [video] = tags('video')
    expect(video).toContain('src="https://media.test/clip.mp4#t=0.001"')
    expect(video).toContain('controls=""')
    expect(video).toContain('playsInline=""')
    expect(video).toContain('preload="metadata"')
  })

  it('embeds a YouTube link and falls back to a plain link for anything else', () => {
    const { tags, html } = render([
      { id: 'a', type: 'video', source: 'embed', url: 'https://youtu.be/aqz-KE-bpKQ' },
      { id: 'b', type: 'video', source: 'embed', url: 'https://example.com/clip' },
    ])
    const [iframe] = tags('iframe')
    expect(iframe).toContain('src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"')
    expect(iframe).toContain('title="Video from Varanasi"')
    expect(iframe).toContain('loading="lazy"')
    expect(iframe).toContain('allowFullScreen=""')
    expect(iframe).toContain('referrerPolicy="strict-origin-when-cross-origin"')
    expect(iframe).toContain('picture-in-picture')
    expect(html).toContain('--ratio:16 / 9')
    expect(html).toMatch(/<a href="https:\/\/example\.com\/clip"[^>]*>https:\/\/example\.com\/clip<\/a>/)
  })
})
