import { Component, type ReactNode } from 'react'

interface Props {
  /** The boundary clears itself when this changes, so navigating away recovers. */
  resetKey: string
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Stops one broken page from blanking the whole app. The likeliest cause is an
 * on-demand chunk (the admin pages) failing to download on a dropped connection,
 * or going missing after a new version was deployed; reloading fixes both.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="placeholder" role="alert">
        <h1>This page didn't load</h1>
        <p>The connection may have dropped. Reloading usually fixes it.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </main>
    )
  }
}
