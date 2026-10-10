import styles from './CoverArt.module.css'

/**
 * Stands in for a trip's cover photo until one is chosen: a sun over three
 * mountain ridges, drawn in the site's colors. It fills its parent and crops
 * itself to any shape.
 */
export default function CoverArt() {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <circle className={styles.halo} cx="288" cy="96" r="70" />
      <circle className={styles.halo} cx="288" cy="96" r="46" />
      <circle className={styles.sun} cx="288" cy="96" r="26" />
      <path
        className={styles.far}
        d="M0 188 40 160 72 176 120 118 150 96 186 138 214 122 250 160 290 146 330 170 366 152 400 168V300H0Z"
      />
      <path className={styles.snow} d="M150 96 132 109.2 140 106 146 113 153 106 158 113 164 112.3Z" />
      <path className={styles.snow} d="M214 122 204 127.7 210 126 214 131 219 127.6 223 131.5Z" />
      <path
        className={styles.mid}
        d="M0 232 48 196 90 216 138 172 176 206 222 180 270 222 312 194 352 216 400 190V300H0Z"
      />
      <path className={styles.near} d="M0 268 60 238 112 258 170 228 232 262 296 240 348 262 400 244V300H0Z" />
    </svg>
  )
}
