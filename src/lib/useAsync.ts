import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  /** The loaded value. Undefined while the first load for the current `deps` is running, or after an error. */
  data: T | undefined
  error: Error | null
  loading: boolean
  /** Runs the loader again, keeping the current `data` visible meanwhile. */
  reload: () => void
}

interface Internal<T> {
  key: string
  data: T | undefined
  error: Error | null
  loading: boolean
}

/**
 * Loads data when the component mounts and whenever `deps` change. Results for
 * old `deps` are never returned, so a page can't briefly show another page's data.
 *
 *   const { data: trip, loading, error } = useAsync(() => store.getTrip(slug), [slug])
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: readonly (string | number | boolean | null | undefined)[],
): AsyncState<T> {
  const key = JSON.stringify(deps)
  const [state, setState] = useState<Internal<T>>({ key, data: undefined, error: null, loading: true })
  const [reloads, setReloads] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let active = true
    setState((previous) =>
      previous.key === key
        ? { ...previous, error: null, loading: true }
        : { key, data: undefined, error: null, loading: true },
    )
    loadRef.current().then(
      (data) => {
        if (active) setState({ key, data, error: null, loading: false })
      },
      (reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error(String(reason))
        if (active) setState({ key, data: undefined, error, loading: false })
      },
    )
    return () => {
      active = false
    }
  }, [key, reloads])

  const reload = useCallback(() => setReloads((count) => count + 1), [])

  if (state.key !== key) return { data: undefined, error: null, loading: true, reload }
  return { data: state.data, error: state.error, loading: state.loading, reload }
}
