import { Link } from 'react-router-dom'
import { useCrumbs } from '../lib/crumbs'

export default function NotFoundPage({ message = "That page doesn't exist." }: { message?: string }) {
  useCrumbs([{ label: 'Not found' }])
  return (
    <main className="placeholder">
      <h1>Off the map</h1>
      <p>{message}</p>
      <Link className="btn btn-primary" to="/">
        Back to all trips
      </Link>
    </main>
  )
}
