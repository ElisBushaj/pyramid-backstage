import { forwardRef, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import type { ReservationStatus } from '@/api/types/reservations'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'

/** One reserved asset line: display name + quantity. */
export interface ReservationAssetLine {
  name: string
  qty: number
}

export interface ReservationCardProps {
  /** Space display name (header, 16/600). */
  space: string
  /** Pre-formatted reservation window, e.g. "22 Jul · 14:00–18:00". */
  window: string
  /** Lifecycle status — drives the HELD lease strip and the header badge. */
  status: ReservationStatus
  /**
   * Lease expiry ISO. When status is HELD and `countdown` is not supplied, the
   * strip ticks a live mm:ss remaining off this.
   */
  expiresAt?: string | null
  /** Pre-formatted countdown override (e.g. "12:04"); wins over `expiresAt`. */
  countdown?: string
  /** Reserved assets table. */
  assets?: ReservationAssetLine[]
  className?: string
}

function formatRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function useLeaseCountdown(expiresAt: string | null | undefined, override: string | undefined, active: boolean) {
  const [value, setValue] = useState(() =>
    override ?? (active && expiresAt ? formatRemaining(expiresAt) : undefined),
  )
  useEffect(() => {
    if (override || !active || !expiresAt) {
      setValue(override)
      return
    }
    setValue(formatRemaining(expiresAt))
    const id = setInterval(() => setValue(formatRemaining(expiresAt)), 1000)
    return () => clearInterval(id)
  }, [override, active, expiresAt])
  return value
}

/**
 * §3.6 — a 300px reservation card. When HELD the border warms to warning@30%
 * and a `.lease-pulse` countdown strip breathes above the body; otherwise the
 * border is a quiet hairline. Body carries the space, window, status badge and
 * the reserved-assets table.
 */
export const ReservationCard = forwardRef<HTMLDivElement, ReservationCardProps>(function ReservationCard(
  { space, window, status, expiresAt, countdown, assets = [], className },
  ref,
) {
  const t = useT()
  const held = status === 'HELD'
  const lease = useLeaseCountdown(expiresAt, countdown, held)

  return (
    <div
      ref={ref}
      className={cn(
        'w-[300px] overflow-hidden rounded-lg bg-surface shadow-raised',
        held ? 'border border-[rgba(154,107,0,0.3)]' : 'border border-border-subtle',
        className,
      )}
    >
      {held && lease ? (
        <div className="flex items-center justify-between border-b border-[rgba(154,107,0,0.2)] bg-warning-subtle px-4 py-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-[600] text-warning">
            <Clock className="size-[13px]" strokeWidth={1.8} aria-hidden />
            {t('reservation.leaseExpiresIn')}
          </span>
          <span className="lease-pulse font-mono text-[15px] font-[600] tabular-nums text-warning">{lease}</span>
        </div>
      ) : null}

      <div className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[16px] font-[600] text-text-primary">{space}</div>
            <div className="mt-0.5 font-mono text-[13px] text-text-secondary">{window}</div>
          </div>
          <StatusBadge status={status} className="shrink-0" />
        </div>

        <div className="border-t border-border-subtle pt-3">
          <div className="mb-2 text-[11px] uppercase tracking-[0.04em] text-text-tertiary">{t('reservation.reservedAssets')}</div>
          <div>
            {assets.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex items-center justify-between py-[3px] text-[13px]">
                <span className="min-w-0 truncate text-text-secondary">{a.name}</span>
                <span className="shrink-0 font-mono font-[600] tabular-nums text-text-primary">×{a.qty}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
