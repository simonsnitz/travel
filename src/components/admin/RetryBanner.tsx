import { RefreshCw } from 'lucide-react'
import styles from './RetryBanner.module.css'

interface RetryBannerProps {
  message: string
  onRetry: () => void
}

/** Says that something didn't load and offers to load it again. */
export default function RetryBanner({ message, onRetry }: RetryBannerProps) {
  return (
    <div className={`banner banner-error ${styles.banner}`} role="alert">
      <p>{message}</p>
      <button className="btn" type="button" onClick={onRetry}>
        <RefreshCw aria-hidden size={18} />
        Try again
      </button>
    </div>
  )
}
