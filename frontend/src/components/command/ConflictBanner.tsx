import { AlertTriangle, ChevronRight } from 'lucide-react'
import type { Conflict } from '@/api/types/_envelope'
import { Button } from '@/components/ui/Button'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateRange } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The signature moment (§3.2) — renders ONE calm danger-tinted explainer per
 * Conflict: a white warning-icon tile, an ink title, a mono type-chip, the
 * human detail, a 2-col meta row (colliding window + conflicting-request id
 * chips), and — for ASSET_OVERALLOCATED — a requested/available over-allocation
 * meter whose excess is drawn with the shared `.hatch-danger` zone.
 */

/** The Conflict, plus the meter `total` the over-allocation bar needs. The
 *  contract `Conflict` carries `requested`/`available`; `total` (inventory pool)
 *  rides as an optional extension the meter falls back from `requested` without. */
export type ConflictBannerItem = Conflict & { total?: number; label?: string }

export interface ConflictBannerProps {
  conflicts: ConflictBannerItem[]
  /** Override the default "See alternatives" / "Adjust request" action row. */
  actions?: React.ReactNode
  className?: string
}

export function ConflictBanner({ conflicts, actions, className }: ConflictBannerProps) {
  if (!conflicts.length) return null
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {conflicts.map((c, i) => (
        <ConflictCard key={i} conflict={c} actions={actions} />
      ))}
    </div>
  )
}

function ConflictCard({ conflict: c, actions }: { conflict: ConflictBannerItem; actions?: React.ReactNode }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const ids = c.conflictingRequestIds ?? []

  return (
    <section className="rounded-lg border border-[rgba(200,55,45,0.28)] bg-danger-subtle p-5">
      {/* Header: white icon tile · ink title · mono type chip */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] bg-surface shadow-[inset_0_0_0_1px_rgba(200,55,45,0.2)]">
          <AlertTriangle className="size-[15px] text-danger" strokeWidth={1.6} />
        </span>
        <h3 className="text-[16px] font-[600] text-text-primary">{t(`conflict.${c.type}`)}</h3>
        <span className="rounded-[5px] border border-[rgba(200,55,45,0.25)] bg-surface px-[7px] py-0.5 font-mono text-[11px] font-[600] text-danger">
          {c.type}
        </span>
      </div>

      {/* Detail paragraph — dark-danger ink, NOT a token */}
      <p className="mt-3 text-[14px] leading-[21px] text-[#7A2A23]">{c.detail}</p>

      {/* Meta: colliding window · conflicting requests */}
      <div className="mt-3.5 flex flex-wrap gap-7">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.04em] text-[#A6564E]">{t('conflict.collidingWindow')}</div>
          <div className="font-mono text-[13px] tabular-nums text-text-primary">
            {formatDateRange(c.window.start, c.window.end, locale)}
          </div>
        </div>
        {ids.length ? (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-[0.04em] text-[#A6564E]">{t('conflict.conflictingRequests')}</div>
            <div className="flex flex-wrap gap-1.5">
              {ids.map((id) => (
                <span
                  key={id}
                  className="rounded-[5px] border border-[rgba(200,55,45,0.25)] bg-surface px-[7px] py-0.5 font-mono text-[12px] text-danger"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Over-allocation meter — ASSET_OVERALLOCATED only */}
      {c.type === 'ASSET_OVERALLOCATED' ? <OverAllocationMeter conflict={c} /> : null}

      {/* Actions */}
      <div className="mt-[18px] flex flex-wrap gap-2.5">
        {actions ?? (
          <>
            <Button variant="primary" size="md">
              {t('conflict.seeAlternatives')}
              <ChevronRight className="size-[13px]" strokeWidth={1.8} />
            </Button>
            <Button variant="secondary" size="md">
              {t('conflict.adjust')}
            </Button>
          </>
        )}
      </div>
    </section>
  )
}

function OverAllocationMeter({ conflict: c }: { conflict: ConflictBannerItem }) {
  const t = useT()
  const requested = c.requested ?? 0
  const available = c.available ?? 0
  const total = c.total ?? Math.max(requested, available)
  const denom = Math.max(1, total)
  const availPct = Math.min(100, (available / denom) * 100)
  const reqPct = Math.min(100, (requested / denom) * 100)

  return (
    <div className="mt-4 rounded-md border border-[rgba(200,55,45,0.2)] bg-surface p-3.5">
      <div className="mb-2 flex items-center justify-between text-[13px]">
        <span className="text-text-secondary">{c.label ?? c.assetId ?? t(`conflict.${c.type}`)}</span>
        <span className="font-mono tabular-nums">
          <span className="font-[600] text-danger">
            {t('conflict.requestedShort')} {requested}
          </span>
          <span className="text-text-tertiary">
            {' / '}
            {t('conflict.availableShort')} {available} of {total}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-pill bg-surface-sunken">
        <div className="absolute inset-y-0 left-0 bg-success" style={{ width: `${availPct}%` }} />
        <div
          className="hatch-danger absolute inset-y-0 border-l border-dashed border-danger bg-[rgba(200,55,45,0.18)]"
          style={{ left: `${availPct}%`, width: `${Math.max(0, reqPct - availPct)}%` }}
        />
      </div>
    </div>
  )
}
