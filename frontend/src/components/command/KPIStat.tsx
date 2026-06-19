import { cn } from '@/lib/cn'

/**
 * KPIStat — §3.10. Big tabular number + sentence-case label + optional trend ▲▼.
 *
 * Label is 13px secondary (sentence-case), NOT uppercase tertiary. The value is
 * mono 30/600 tabular and turns danger when `alert`. Trend color is decoupled
 * from sign — pass `trendUp` explicitly (canvas tile 4 is a +2 that points down).
 */
export interface KPIStatProps {
  label: string
  value: number | string
  trend?: number | string
  trendUp?: boolean
  alert?: boolean
  sub?: string
}

export function KPIStat({ label, value, trend, trendUp, alert, sub }: KPIStatProps) {
  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised">
      <div className="mb-2.5 min-h-[34px] text-[13px] leading-[17px] text-text-secondary">{label}</div>
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            'font-mono text-[30px] font-[600] leading-none tabular-nums tracking-[-0.02em]',
            alert ? 'text-danger' : 'text-text-primary',
          )}
        >
          {value}
        </span>
        {trend !== undefined && trend !== null ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[13px] font-[600]',
              trendUp ? 'text-success' : 'text-danger',
            )}
          >
            <span aria-hidden>{trendUp ? '▲' : '▼'}</span>
            {trend}
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-1 text-[12px] text-text-tertiary">{sub}</div> : null}
    </div>
  )
}
