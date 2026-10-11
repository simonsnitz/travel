/** How full the storage is, in the terms the admin page shows. */
export interface StorageSummary {
  /** For example "412 MB". */
  used: string
  /** For example "1 GB". */
  allowance: string
  /** Whole percent of the allowance in use, capped at 100 for the bar. */
  percent: number
  level: 'fine' | 'filling' | 'full'
}

/** From here on the line turns into a warning, while there is still time to act on it. */
const FILLING_FROM = 0.8

export function summariseStorage(bytes: number, allowanceBytes: number): StorageSummary {
  const fraction = allowanceBytes > 0 ? bytes / allowanceBytes : 0
  return {
    used: formatSize(bytes),
    allowance: formatSize(allowanceBytes),
    percent: Math.min(100, Math.round(fraction * 100)),
    level: fraction >= 1 ? 'full' : fraction >= FILLING_FROM ? 'filling' : 'fine',
  }
}

/** A size in decimal units (1 MB is a million bytes), which is how storage allowances are counted. */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${trim(bytes / 1e9, bytes >= 1e10 ? 0 : 2)} GB`
  if (bytes >= 1e6) return `${trim(bytes / 1e6, bytes >= 1e7 ? 0 : 1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`
  return bytes > 0 ? '1 KB' : '0 MB'
}

/** "1.00" reads better as "1", and "1.10" as "1.1". */
const trim = (value: number, decimals: number) => String(Number(value.toFixed(decimals)))
