import type { ReactNode } from 'react'
import styles from './Segmented.module.css'

interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

interface SegmentedProps<T extends string> {
  /** Names the choice for screen readers. Not shown. */
  label: string
  /** Radio group name; must be unique on the page. */
  name: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange(value: T): void
  disabled?: boolean
}

/** A two-or-three-way switch. Built from radio buttons, so arrow keys and screen readers work as usual. */
export default function Segmented<T extends string>({ label, name, value, options, onChange, disabled = false }: SegmentedProps<T>) {
  return (
    <div className={styles.group} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            className="visually-hidden"
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          <span className={styles.face}>
            {option.icon}
            {option.label}
          </span>
        </label>
      ))}
    </div>
  )
}
