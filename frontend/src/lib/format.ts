type Loc = 'al' | 'en'
const intlLocale = (l: Loc) => (l === 'al' ? 'sq-AL' : 'en-GB')

/**
 * Pyramid of Tirana — every event/venue time renders in VENUE-local time, not the
 * viewer's browser timezone, so a booking's hours are identical for every viewer
 * regardless of where they sit (XC-7). The API stores ISO-Z instants; we pin the
 * wall-clock to Europe/Tirana on render.
 */
const VENUE_TZ = 'Europe/Tirana'

/** A parsed Date, or null for a missing/malformed ISO (so we render '—', not "Invalid Date"). */
function valid(iso?: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** YYYY-MM-DD in venue time — used to decide whether two instants fall on the same venue day. */
function venueDayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: VENUE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function formatDate(iso?: string | null, locale: Loc = 'en'): string {
  const d = valid(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: VENUE_TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

export function formatDateTime(iso?: string | null, locale: Loc = 'en'): string {
  const d = valid(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: VENUE_TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

export function formatTime(iso?: string | null, locale: Loc = 'en'): string {
  const d = valid(iso)
  if (!d) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: VENUE_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** A compact relative label ("in 3h", "2d ago"). Falls back to absolute date. */
export function formatRelative(iso?: string | null, locale: Loc = 'en'): string {
  const d = valid(iso)
  if (!d) return '—'
  const diffMs = d.getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'short' })
  const min = 60_000, hour = 3_600_000, day = 86_400_000
  if (abs < hour) return rtf.format(Math.round(diffMs / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour')
  if (abs < 7 * day) return rtf.format(Math.round(diffMs / day), 'day')
  return formatDate(iso, locale)
}

export function formatDateRange(start?: string | null, end?: string | null, locale: Loc = 'en'): string {
  const s = valid(start)
  const e = valid(end)
  if (!s || !e) return '—'
  // A window crossing midnight (in venue time) must show the end date too, else it reads as ending earlier the same day.
  const sameDay = venueDayKey(s) === venueDayKey(e)
  return `${formatDateTime(start, locale)} – ${sameDay ? formatTime(end, locale) : formatDateTime(end, locale)}`
}

/** Canonical alias — venue-pinned datetime. Prefer this name at new call sites. */
export const formatVenueDateTime = formatDateTime
