import styles from './InlineSpinner.module.css'

/** A small spinner for inside a button, next to a label that says what is happening. */
export default function InlineSpinner() {
  return <span className={`spinner ${styles.inline}`} aria-hidden />
}
