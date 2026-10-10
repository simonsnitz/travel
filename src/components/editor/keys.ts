import type { KeyboardEvent } from 'react'

/**
 * For single-line fields outside a form, where Return would otherwise do
 * nothing: it leaves the field, which on a phone puts the keyboard away.
 */
export function blurOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  // While composing (Japanese, Chinese, Korean), Return confirms the composition instead.
  if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
}
