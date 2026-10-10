/** Centered spinner for a page, or part of one, that is still loading. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="placeholder">
      <span className="spinner" role="status" aria-label={label} />
    </div>
  )
}

/** A failed load, with a way to try again. Store errors are written to be shown as they are. */
export function LoadError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="placeholder" role="alert">
      <p>{error.message || 'Something went wrong. Check your connection and try again.'}</p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
