import { memo, useId, useLayoutEffect, useRef } from 'react'
import type { TextBlock } from '../../lib/types'
import styles from './TextBlockEditor.module.css'

interface TextBlockEditorProps {
  block: TextBlock
  /** Put the cursor here as soon as the block appears (it was just added). */
  autoFocus: boolean
  onChange(id: string, text: string): void
}

/** Makes the textarea exactly as tall as its text, so the page scrolls rather than the field. */
function fitToContent(textarea: HTMLTextAreaElement) {
  const holder = textarea.parentElement
  // Measuring means collapsing the textarea for a moment. Holding its wrapper
  // open meanwhile keeps the page from shrinking, which would otherwise make a
  // long entry jump up the screen on every keystroke.
  if (holder) holder.style.minHeight = `${holder.offsetHeight}px`
  textarea.style.height = 'auto'
  const borders = textarea.offsetHeight - textarea.clientHeight
  textarea.style.height = `${textarea.scrollHeight + borders}px`
  if (holder) holder.style.minHeight = ''
}

function TextBlockEditor({ block, autoFocus, onChange }: TextBlockEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const hintId = useId()

  useLayoutEffect(() => {
    if (textarea.current) fitToContent(textarea.current)
  }, [block.text])

  // The text wraps differently when the column changes width (rotating the
  // phone) or when the web font arrives, so the height is measured again then.
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    let active = true
    let frame = 0
    let width = element.clientWidth
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            // Only a change of width re-wraps the text. Checking also stops the
            // observer from answering its own change to the height.
            if (element.clientWidth === width) return
            width = element.clientWidth
            cancelAnimationFrame(frame)
            // Resized on the next frame: doing it inside the callback makes browsers report a "ResizeObserver loop".
            frame = requestAnimationFrame(() => fitToContent(element))
          })
    observer?.observe(element)
    document.fonts?.ready.then(() => {
      if (active) fitToContent(element)
    })
    return () => {
      active = false
      cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [])

  return (
    <div className={styles.text}>
      <div className={styles.holder}>
        <textarea
          ref={textarea}
          className={`textarea ${styles.paper}`}
          rows={3}
          value={block.text}
          placeholder="Write something…"
          aria-label="Text"
          aria-describedby={hintId}
          autoFocus={autoFocus}
          onChange={(event) => onChange(block.id, event.target.value)}
        />
      </div>
      <p id={hintId} className={`hint ${styles.hint}`}>
        Leave a blank line to start a new paragraph.
      </p>
    </div>
  )
}

export default memo(TextBlockEditor)
