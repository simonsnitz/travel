import { useEffect, useState } from 'react'
import { House, LogOut } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { SITE_TITLE } from '../config'
import { useAuth } from '../lib/auth'
import { useCurrentCrumbs } from '../lib/crumbs'
import styles from './Navbar.module.css'

export default function Navbar() {
  const crumbs = useCurrentCrumbs()
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A failed sign-out is only worth showing on the page where it happened.
  useEffect(() => setError(null), [pathname])

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)
    try {
      await signOut()
      navigate('/')
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : "Couldn't sign out. Try again.")
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <NavLink to="/" end className={styles.home} aria-label={`${SITE_TITLE} home`}>
          <House className={styles.homeIcon} size={20} aria-hidden="true" />
          <span className={styles.homeLabel}>{SITE_TITLE}</span>
        </NavLink>

        {crumbs.length > 0 && (
          <nav className={styles.trail} aria-label="Breadcrumb">
            <ol className={styles.crumbs}>
              {crumbs.map((crumb, index) => {
                const current = index === crumbs.length - 1
                const label = current ? `${styles.label} ${styles.current}` : styles.label
                return (
                  <li key={index} className={styles.crumb}>
                    <span className={styles.slash} aria-hidden="true">
                      /
                    </span>
                    {crumb.to ? (
                      <Link className={label} to={crumb.to} aria-current={current ? 'page' : undefined}>
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className={label} aria-current={current ? 'page' : undefined}>
                        {crumb.label}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}

        {/* Nothing is shown until the saved session has been checked, so a
            signed-in owner never sees the signed-out controls flash by. */}
        {!loading && (
          <div className={styles.actions}>
            <Link className={styles.admin} to="/admin">
              Admin
            </Link>
            {user && (
              <button
                type="button"
                className={`btn btn-sm ${styles.signOut}`}
                onClick={handleSignOut}
                disabled={signingOut}
              >
                <LogOut size={16} aria-hidden="true" />
                <span className={styles.signOutLabel}>Sign out</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className={`banner banner-error ${styles.alert}`} role="alert">
          {error}
        </p>
      )}
    </header>
  )
}
