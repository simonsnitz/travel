import { useId, useState, type SubmitEvent } from 'react'
import { messageOf } from '../../lib/errors'
import InlineSpinner from '../../components/admin/InlineSpinner'
import { useAuth } from '../../lib/auth'
import { useCrumbs } from '../../lib/crumbs'
import { store } from '../../lib/store'
import styles from './SignInScreen.module.css'

/**
 * Shown in place of any admin page until the owner signs in. There is one
 * account, made in the Supabase dashboard, so there is no way to sign up or to
 * reset a password here.
 */
export default function SignInScreen() {
  useCrumbs([{ label: 'Admin' }])
  const { signIn } = useAuth()
  const id = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    // Read from the form rather than from state: a password manager can fill
    // the fields without firing the change events that state depends on.
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') ?? '').trim()
    const password = String(fields.get('password') ?? '')

    setError(null)
    setPending(true)
    try {
      await signIn(email, password)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setPending(false)
    }
  }

  return (
    <main className={`page ${styles.screen}`}>
      <div className={`card ${styles.card}`}>
        <div className={styles.intro}>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>Sign in</h1>
          <p className="muted">For writing and editing trips. Reading them needs no account.</p>
        </div>

        {store.mode === 'demo' && <p className="banner">Demo mode: any email and password will work.</p>}

        {/* The fields are uncontrolled, so a failed attempt leaves the email as it was typed. */}
        <form className="stack" onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor={`${id}-email`}>
              Email
            </label>
            <input
              className="input"
              id={`${id}-email`}
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-password`}>
              Password
            </label>
            <input
              className="input"
              id={`${id}-password`}
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}

          <button className={`btn btn-primary ${styles.submit}`} type="submit" aria-disabled={pending}>
            {pending ? (
              <>
                <InlineSpinner />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </main>
  )
}
