import { Images, Type, Video } from 'lucide-react'
import { Fragment, memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AddBlockBar, AddBlockGap } from './AddBlock'
import BlockFrame from './BlockFrame'
import type { DraftBlock } from './blocks'
import PhotosBlockEditor from './PhotosBlockEditor'
import type { PendingUpload } from './reducer'
import TextBlockEditor from './TextBlockEditor'
import type { BlockActions } from './useDayEditor'
import VideoBlockEditor from './VideoBlockEditor'
import styles from './BlockList.module.css'

interface BlockListProps {
  blocks: DraftBlock[]
  uploads: PendingUpload[]
  actions: BlockActions
}

const KINDS = {
  text: { label: 'Text', icon: <Type size={14} /> },
  photos: { label: 'Photos', icon: <Images size={14} /> },
  video: { label: 'Video', icon: <Video size={14} /> },
} as const

// Shared by every block without uploads, so those blocks' props don't change from one render to the next.
const NO_UPLOADS: PendingUpload[] = []

interface BlockItemProps {
  block: DraftBlock
  position: number
  count: number
  uploads: PendingUpload[]
  autoFocus: boolean
  actions: BlockActions
  onMove(id: string, delta: -1 | 1): void
  onDelete(id: string): void
}

// Memoised, with stable callbacks, so typing in one block doesn't re-render the others.
const BlockItem = memo(function BlockItem({ block, position, count, uploads, autoFocus, actions, onMove, onDelete }: BlockItemProps) {
  const kind = KINDS[block.type]
  return (
    <BlockFrame
      id={block.id}
      label={kind.label}
      icon={kind.icon}
      position={position}
      count={count}
      onMove={(delta) => onMove(block.id, delta)}
      onDelete={() => onDelete(block.id)}
    >
      {block.type === 'text' && <TextBlockEditor block={block} autoFocus={autoFocus} onChange={actions.setText} />}
      {block.type === 'photos' && <PhotosBlockEditor block={block} uploads={uploads} actions={actions} />}
      {block.type === 'video' && <VideoBlockEditor block={block} upload={uploads[0]} actions={actions} />}
    </BlockFrame>
  )
})

/** The day's blocks in order, with a way to add one in every gap and at the end. */
export default function BlockList({ blocks, uploads, actions }: BlockListProps) {
  const root = useRef<HTMLDivElement>(null)
  const latestBlocks = useRef(blocks)
  latestBlocks.current = blocks

  /** The block whose gap is showing its choices; only one is open at a time. */
  const [openGap, setOpenGap] = useState<string | null>(null)
  /** A text block that was just added and should take the cursor. */
  const [focusId, setFocusId] = useState<string | null>(null)
  /** Read out by screen readers after a move or a delete, which are otherwise silent. */
  const [announcement, setAnnouncement] = useState('')
  /** The move button to put focus back on once the blocks have been reordered. */
  const refocus = useRef<{ id: string; direction: 'up' | 'down' } | null>(null)

  const uploadsByBlock = useMemo(() => {
    const groups = new Map<string, PendingUpload[]>()
    for (const upload of uploads) {
      const group = groups.get(upload.blockId)
      if (group) group.push(upload)
      else groups.set(upload.blockId, [upload])
    }
    return groups
  }, [uploads])

  // Reordering moves the block in the document, which drops keyboard focus.
  useLayoutEffect(() => {
    const request = refocus.current
    refocus.current = null
    if (!request || !root.current) return
    const element = Array.from(root.current.querySelectorAll<HTMLElement>('[data-block-id]')).find(
      (candidate) => candidate.dataset.blockId === request.id,
    )
    // At either end the button just used is disabled, so fall back to its partner.
    const directions = request.direction === 'up' ? ['up', 'down'] : ['down', 'up']
    for (const direction of directions) {
      const button = element?.querySelector<HTMLButtonElement>(`[data-block-move="${direction}"]`)
      if (button && !button.disabled) {
        button.focus()
        break
      }
    }
  })

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      const current = latestBlocks.current
      const index = current.findIndex((block) => block.id === id)
      const target = index + delta
      if (index === -1 || target < 0 || target >= current.length) return
      refocus.current = { id, direction: delta === -1 ? 'up' : 'down' }
      actions.moveBlock(id, delta)
      setAnnouncement(`${KINDS[current[index].type].label} moved to position ${target + 1} of ${current.length}.`)
    },
    [actions],
  )

  const remove = useCallback(
    (id: string) => {
      const block = latestBlocks.current.find((candidate) => candidate.id === id)
      if (block && actions.deleteBlock(id)) setAnnouncement(`${KINDS[block.type].label} deleted.`)
    },
    [actions],
  )

  const addText = (beforeId: string | null) => setFocusId(actions.insertText(beforeId))

  return (
    <div ref={root} className={styles.list}>
      {blocks.map((block, index) => (
        <Fragment key={block.id}>
          <AddBlockGap
            open={openGap === block.id}
            onToggle={(open) => setOpenGap(open ? block.id : null)}
            onAddText={() => addText(block.id)}
            onAddPhotos={(files) => actions.insertPhotos(block.id, files)}
            onAddVideo={() => actions.insertVideo(block.id)}
          />
          <BlockItem
            block={block}
            position={index + 1}
            count={blocks.length}
            uploads={uploadsByBlock.get(block.id) ?? NO_UPLOADS}
            autoFocus={block.id === focusId}
            actions={actions}
            onMove={move}
            onDelete={remove}
          />
        </Fragment>
      ))}
      <AddBlockBar
        empty={blocks.length === 0}
        onAddText={() => addText(null)}
        onAddPhotos={(files) => actions.insertPhotos(null, files)}
        onAddVideo={() => actions.insertVideo(null)}
      />
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
