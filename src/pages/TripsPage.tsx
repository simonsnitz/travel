import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import CoverArt from '../components/CoverArt'
import { LoadError, Loading } from '../components/PageStatus'
import { isUnderWay } from '../components/tripDays'
import { SITE_TAGLINE, SITE_TITLE } from '../config'
import { useCrumbs } from '../lib/crumbs'
import { formatRange } from '../lib/dates'
import { store } from '../lib/store'
import type { Trip } from '../lib/types'
import { useAsync } from '../lib/useAsync'
import styles from './TripsPage.module.css'

export default function TripsPage() {
  useCrumbs([])
  const { data: trips, error, reload } = useAsync(() => store.listTrips(), [])

  // Hash navigation keeps the scroll position of the page the reader came from.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="page">
      <header className={styles.masthead}>
        <h1 className={styles.siteTitle}>{SITE_TITLE}</h1>
        <p className={styles.tagline}>{SITE_TAGLINE}</p>
      </header>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !trips ? (
        <Loading label="Loading trips" />
      ) : trips.length === 0 ? (
        <p className="placeholder">No trips yet.</p>
      ) : (
        <TripList trips={trips} />
      )}
    </main>
  )
}

function TripList({ trips }: { trips: Trip[] }) {
  // One trip gets the big tile: the one under way if there is one, otherwise
  // the newest. A single trip then fills the page instead of sitting in a corner.
  const featured = trips.find((trip) => isUnderWay(trip)) ?? trips[0]
  const others = trips.filter((trip) => trip !== featured)

  return (
    <>
      <TripTile trip={featured} featured />
      {others.length > 0 && (
        <>
          <p className={`eyebrow ${styles.moreLabel}`} id="more-trips">
            More trips
          </p>
          <ul className={styles.grid} aria-labelledby="more-trips">
            {others.map((trip) => (
              <li key={trip.id}>
                <TripTile trip={trip} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function TripTile({ trip, featured = false }: { trip: Trip; featured?: boolean }) {
  const { cover } = trip
  // The big tile is wide enough on a desktop to need the full-size photo.
  const fullSize = featured && cover ? store.mediaUrl(cover.path) : ''

  return (
    <Link to={`/${trip.slug}`} className={`card ${styles.tile} ${featured ? styles.featured : ''}`}>
      <div className={styles.cover}>
        {cover ? (
          <picture>
            {fullSize && <source media="(min-width: 760px)" srcSet={fullSize} />}
            <img
              src={store.mediaUrl(cover.thumbPath) || undefined}
              alt=""
              width={cover.width}
              height={cover.height}
              loading={featured ? undefined : 'lazy'}
              decoding="async"
            />
          </picture>
        ) : (
          <CoverArt />
        )}
      </div>
      <div className={styles.body}>
        {isUnderWay(trip) && (
          <p className={`eyebrow ${styles.live}`}>
            <span className={styles.pulse} aria-hidden="true" />
            On the road now
          </p>
        )}
        <h2 className={styles.title}>{trip.title}</h2>
        <p className={styles.dates}>{formatRange(trip.startDate, trip.endDate)}</p>
        {featured && (
          <span className={styles.more}>
            Read the journal
            <ArrowRight size={18} aria-hidden="true" />
          </span>
        )}
      </div>
    </Link>
  )
}
