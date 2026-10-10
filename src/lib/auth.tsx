import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { store } from './store'
import type { AdminUser } from './types'

interface AuthState {
  /** The signed-in admin, or null. */
  user: AdminUser | null
  /** True until the saved session has been checked on first load. */
  loading: boolean
  /** Rejects with a user-facing message if the sign-in fails. */
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    store
      .getUser()
      .then((current) => {
        if (active) setUser(current)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = store.onAuthChange((next) => {
      if (active) setUser(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async signIn(email, password) {
        setUser(await store.signIn(email, password))
      },
      async signOut() {
        await store.signOut()
        setUser(null)
      },
    }),
    [user, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be used inside <AuthProvider>.')
  return state
}
