import type { Quote, LineItem } from '@/api/types/quotes'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

/**
 * QuoteTable — §3.7. Line items in a fixed 5-col grid, then a right-aligned
 * totals block: Net / VAT / a 2px ink rule / emphasized Total. Currency suffix
 * (" ALL") rides as its own tertiary span so the number stays mono + tabular.
 */

// Kind → badge tone. Contract kinds are SPACE | ASSET | SERVICE; the canvas
// labels the service line "LABOR", so both map to warning.
const KIND_TONE: Record<string, BadgeTone> = {
  SPACE: 'info',
  ASSET: 'neutral',
  SERVICE: 'warning',
  LABOR: 'warning',
}

const GRID = 'grid-cols-[1fr_90px_70px_110px_120px]'

/** Grouped thousands, no currency suffix — the suffix is rendered separately. */
function groupMinor(minor: number, locale: 'al' | 'en'): string {
  return new Intl.NumberFormat(locale === 'al' ? 'sq-AL' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(minor)
}

export function QuoteTable({ quote }: { quote: Quote }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const currency = quote.currency ?? 'ALL'
  return (
    <div className="w-[620px] max-w-full">
      <div
        className={`grid ${GRID} gap-3 border-b border-border-subtle pb-2.5 text-[11px] font-[500] uppercase tracking-[0.04em] text-text-tertiary`}
      >
        <span>{t('quote.item')}</span>
        <span>{t('quote.kind')}</span>
        <span className="text-right">{t('quote.qty')}</span>
        <span className="text-right">{t('quote.unit')}</span>
        <span className="text-right">{t('quote.subtotal')}</span>
      </div>

      <div>
        {quote.lineItems.map((li, i) => (
          <LineRow key={i} item={li} locale={locale} />
        ))}
      </div>

      <dl className="ml-auto mt-3.5 w-[280px]">
        <TotalRow label={t('quote.net')} value={groupMinor(quote.netMinor, locale)} currency={currency} />
        <TotalRow label={t('quote.vat')} value={groupMinor(quote.vatMinor, locale)} currency={currency} />
        <div className="mt-1.5 border-t-2 border-text-primary" />
        <TotalRow label={t('quote.total')} value={groupMinor(quote.totalMinor, locale)} currency={currency} emphasis />
      </dl>
    </div>
  )
}

function LineRow({ item, locale }: { item: LineItem; locale: 'al' | 'en' }) {
  return (
    <div className={`grid ${GRID} items-center gap-3 border-b border-border-subtle py-3 text-[14px]`}>
      <span className="font-[500] text-text-primary">{item.label}</span>
      <span>
        <Badge tone={KIND_TONE[item.kind] ?? 'neutral'}>{item.kind}</Badge>
      </span>
      <span className="text-right font-mono tabular-nums text-text-secondary">×{item.qty}</span>
      <span className="text-right font-mono tabular-nums text-text-secondary">{groupMinor(item.unitPriceMinor, locale)}</span>
      <span className="text-right font-mono font-[600] tabular-nums text-text-primary">{groupMinor(item.subtotalMinor, locale)}</span>
    </div>
  )
}

function TotalRow({
  label,
  value,
  currency,
  emphasis,
}: {
  label: string
  value: string
  currency: string
  emphasis?: boolean
}) {
  return (
    <div className={`flex items-center justify-between ${emphasis ? 'pt-3.5' : 'py-[7px]'}`}>
      <dt className={emphasis ? 'text-[15px] font-[600] text-text-primary' : 'text-[14px] text-text-secondary'}>
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? 'font-mono text-[19px] font-[700] tabular-nums text-text-primary'
            : 'font-mono text-[14px] font-[550] tabular-nums text-text-primary'
        }
      >
        {value}
        <span className="ml-1 font-sans text-[12px] font-[400] text-text-tertiary">{currency}</span>
      </dd>
    </div>
  )
}
