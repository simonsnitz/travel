/** The text to show for something a store call rejected with. Store errors carry user-facing messages. */
export function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message.trim() || 'Something went wrong. Check your connection and try again.'
}

/** True for the error an upload rejects with when it is cancelled. */
export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}
