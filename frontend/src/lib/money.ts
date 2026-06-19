/**
 * Money is integer minor units on the wire (ALL = Albanian Lek, factor 1).
 * Format for display only here — never do money math in the UI (the server is
 * authoritative). Grouped thousands, no decimals, currency suffix.
 */
export function formatMinor(minor: number, locale: 'al' | 'en' = 'en'): string {
  const grouped = new Intl.NumberFormat(locale === 'al' ? 'sq-AL' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(minor)
  return `${grouped} ALL`
}
