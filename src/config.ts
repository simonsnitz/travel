export const SITE_TITLE = "Simon's Travels"
export const SITE_TAGLINE = 'Notes, photos, and videos from the road.'

/** Largest video file the free Supabase plan accepts. */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024

/** The free Supabase plan's allowance for stored photos and clips. */
export const STORAGE_LIMIT_BYTES = 1_000_000_000

/**
 * How a photo is stored: the longest edge in pixels and the JPEG quality, for
 * the full-size copy and for its thumbnail. These are the settings to change
 * to trade sharpness for space. At 1600 pixels a typical phone photo comes to
 * about 0.3 to 0.45 MB with its thumbnail, so 1 GB holds roughly 2,500 of them.
 */
export const PHOTO_MAX_EDGE = 1600
export const PHOTO_QUALITY = 0.8
export const THUMB_MAX_EDGE = 720
export const THUMB_QUALITY = 0.72

/**
 * Ceilings that hold whatever the photo: an unusually detailed one is
 * compressed harder, and then made smaller, until it fits. Together they keep
 * every stored photo, thumbnail included, under 1 MB.
 */
export const PHOTO_MAX_BYTES = 850_000
export const THUMB_MAX_BYTES = 100_000

/** Trip slugs that would collide with app routes. */
export const RESERVED_SLUGS = ['admin']

/** The GitHub repository the site is published from, as "owner/name". The admin page uses it to check on the daily backup. */
export const GITHUB_REPO = 'simonsnitz/travel'
