import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './BlockFrame.module.css'

interface BlockFrameProps {
  id: string
  /** "Text", "Photos" or "Video". */
  label: string
  icon: ReactNode
  /** 1 for the first block of the day. */
  position: number
  count: number
  onMove(delta: -1 | 1): void
  onDelete(): void
  children: ReactNode
}

/** The sheet of paper a block sits on, with its type and the move and delete buttons along the top. */
export default function BlockFrame({ id, label, icon, position, count, onMove, onDelete, children }: BlockFrameProps) {
  const name = label.toLowerCase()
  return (
    <div className={styles.block} role="group" aria-label={`${label}, block ${position} of ${count}`} data-block-id={id}>
      <div className={styles.header}>
        <span className={styles.kind}>
          {icon}
          {label}
        </span>
        <div className={styles.tools}>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${styles.tool}`}
            aria-label={`Move ${name} up`}
            data-block-move="up"
            disabled={position <= 1}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-icon ${styles.tool}`}
            aria-label={`Move ${name} down`}
            data-block-move="down"
            disabled={position >= count}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={18} />
          </button>
          <button type="button" className={`btn btn-danger btn-icon ${styles.tool}`} aria-label={`Delete ${name}`} onClick={onDelete}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
