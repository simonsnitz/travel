import { Outlet } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import SignInScreen from './SignInScreen'

/** Wraps every /admin route: nothing behind it renders until the owner has signed in. */
export default function AdminLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <main className="placeholder">
        <span className="spinner" role="status" aria-label="Loading" />
      </main>
    )
  }
  if (!user) return <SignInScreen />

  return (
    <main className="page">
      <Outlet />
    </main>
  )
}
