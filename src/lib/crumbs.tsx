import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SITE_TITLE } from '../config'

/** One step of the navbar's directory trail, e.g. "India & Nepal" / "October 14". */
export interface Crumb {
  label: string
  /** Route to link to. Leave out for the current page. */
  to?: string
}

const CrumbsContext = createContext<{ crumbs: Crumb[]; setCrumbs: (crumbs: Crumb[]) => void } | null>(null)

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  return <CrumbsContext.Provider value={{ crumbs, setCrumbs }}>{children}</CrumbsContext.Provider>
}

/**
 * Declares the current page's directory trail, which the navbar displays, and
 * sets the browser tab title to match. Call it from page components.
 */
export function useCrumbs(crumbs: Crumb[]): void {
  const context = useContext(CrumbsContext)
  if (!context) throw new Error('useCrumbs must be used inside <CrumbsProvider>.')
  const { setCrumbs } = context
  // Compare by value so a new array literal on each render doesn't loop.
  const serialized = JSON.stringify(crumbs)

  useEffect(() => {
    const next = JSON.parse(serialized) as Crumb[]
    setCrumbs(next)
    document.title = [...next.map((crumb) => crumb.label).reverse(), SITE_TITLE].join(' · ')
    return () => {
      setCrumbs([])
      document.title = SITE_TITLE
    }
  }, [serialized, setCrumbs])
}

/** The trail declared by the current page. For the navbar. */
export function useCurrentCrumbs(): Crumb[] {
  return useContext(CrumbsContext)?.crumbs ?? []
}
