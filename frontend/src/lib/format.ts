type Loc = 'al' | 'en'
const intlLocale = (l: Loc) => (l === 'al' ? 'sq-AL' : 'en-GB')

export function formatDate(iso?: string | null, locale: Loc = 'en'): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

export function formatDateTime(iso?: string | null, locale: Loc = 'en'): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

export function formatTime(iso?: string | null, locale: Loc = 'en'): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** A compact relative label ("in 3h", "2d ago"). Falls back to absolute date. */
export function formatRelative(iso?: string | null, locale: Loc = 'en'): string {
  if (!iso) return '—'
  const diffMs = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diffMs)
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: 'auto', style: 'short' })
  const min = 60_000, hour = 3_600_000, day = 86_400_000
  if (abs < hour) return rtf.format(Math.round(diffMs / min), 'minute')
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour')
  if (abs < 7 * day) return rtf.format(Math.round(diffMs / day), 'day')
  return formatDate(iso, locale)
}

export function formatDateRange(start?: string | null, end?: string | null, locale: Loc = 'en'): string {
  if (!start || !end) return '—'
  return `${formatDateTime(start, locale)} – ${formatTime(end, locale)}`
}
