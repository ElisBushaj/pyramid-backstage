import type { Quote } from '@/api/types/quotes'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatMinor } from '@/lib/money'
import { Badge } from '@/components/ui/Badge'

export function QuoteTable({ quote }: { quote: Quote }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[12px] uppercase tracking-[0.02em] text-text-tertiary">
              <th className="py-1.5 text-left font-[550]">{t('quote.item')}</th>
              <th className="py-1.5 text-right font-[550]">{t('quote.qty')}</th>
              <th className="py-1.5 text-right font-[550]">{t('quote.unit')}</th>
              <th className="py-1.5 text-right font-[550]">{t('quote.subtotal')}</th>
            </tr>
          </thead>
          <tbody>
            {quote.lineItems.map((li, i) => (
              <tr key={i} className="border-t border-border-subtle">
                <td className="py-2.5">
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral" className="text-[10px]">{li.kind}</Badge>
                    <span className="text-text-primary">{li.label}</span>
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono tabular-nums text-text-secondary">{li.qty}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-text-secondary">{formatMinor(li.unitPriceMinor, locale)}</td>
                <td className="py-2.5 text-right font-mono tabular-nums text-text-primary">{formatMinor(li.subtotalMinor, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-3 text-[13px]">
        <Row label={t('quote.net')} value={formatMinor(quote.netMinor, locale)} />
        <Row label={t('quote.vat')} value={formatMinor(quote.vatMinor, locale)} />
        <Row label={t('quote.total')} value={formatMinor(quote.totalMinor, locale)} emphasis />
      </dl>
    </div>
  )
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={emphasis ? 'text-[15px] font-[600] text-text-primary' : 'text-text-secondary'}>{label}</dt>
      <dd className={`font-mono tabular-nums ${emphasis ? 'text-[16px] font-[600] text-text-primary' : 'text-text-secondary'}`}>{value}</dd>
    </div>
  )
}
