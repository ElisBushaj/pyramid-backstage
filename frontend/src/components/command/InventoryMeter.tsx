import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { useT } from '@/i18n/useT'

/** Stock pressure of an asset pool: low → amber LOW STOCK badge, none free → danger OUT OF STOCK. */
export type InventoryState = 'ok' | 'low' | 'danger'

export interface InventoryMeterProps {
  /** Asset name (col 1, top). */
  name?: string
  /** Storage location (col 1, sub). */
  location?: string
  /** Units free in the requested window. */
  available: number
  /** Units held by other events (drawn as the amber tail segment). */
  held?: number
  /** Total pool size. */
  total: number
  /**
   * Stock state. Omit to derive: 0 available → 'danger', ≤10% of total → 'low', else 'ok'.
   * Drives the available-segment color and the right-rail badge.
   */
  state?: InventoryState
  onClick?: () => void
  className?: string
}

function deriveState(available: number, total: number): InventoryState {
  if (total > 0 && available <= 0) return 'danger'
  if (total > 0 && available <= total * 0.1) return 'low'
  return 'ok'
}

/**
 * §3.4 — one asset's availability as a 3-col grid row: name + location, the
 * available/held meter (held tail in literal amber #E0A300, available crosses to
 * danger when the pool is exhausted), and a right-aligned mono count + state badge.
 */
export function InventoryMeter({
  name,
  location,
  available,
  held = 0,
  total,
  state,
  onClick,
  className,
}: InventoryMeterProps) {
  const t = useT()
  const resolved = state ?? deriveState(available, total)
  const denom = Math.max(1, total)
  const availPct = Math.max(0, Math.min(100, (available / denom) * 100))
  const heldPct = Math.max(0, Math.min(100 - availPct, (held / denom) * 100))
  const danger = resolved === 'danger'
  const low = resolved === 'low'

  return (
    <div
      className={cn(
        'grid grid-cols-[200px_1fr_150px] items-center gap-5 border-b border-border-subtle py-3.5',
        onClick && 'cursor-pointer transition-colors hover:bg-surface-subtle',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
    >
      {/* Col 1 — name + location */}
      <div className="min-w-0">
        {name ? <div className="truncate text-[14px] font-[550] text-text-primary">{name}</div> : null}
        {location ? <div className="truncate text-[12px] text-text-tertiary">{location}</div> : null}
      </div>

      {/* Col 2 — meter + legend */}
      <div>
        <div className="relative h-3 overflow-hidden rounded-pill bg-surface-sunken shadow-[inset_0_0_0_1px_rgba(11,13,18,0.05)]">
          <div
            className={cn('absolute inset-y-0 left-0', danger ? 'bg-danger' : 'bg-success')}
            style={{ width: `${availPct}%` }}
          />
          {heldPct > 0 ? (
            <div className="absolute inset-y-0 bg-[#E0A300]" style={{ left: `${availPct}%`, width: `${heldPct}%` }} />
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-3.5 text-[12px] text-text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn('size-[7px] rounded-xs', danger ? 'bg-danger' : 'bg-success')}
              aria-hidden
            />
            {t('inventory.availableLower')}
          </span>
          {held > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-[7px] rounded-xs bg-[#E0A300]" aria-hidden />
              {t('inventory.heldLower')} {held}
            </span>
          ) : null}
        </div>
      </div>

      {/* Col 3 — count + state badge */}
      <div className="text-right">
        <div className={cn('font-mono text-[15px] font-[600] tabular-nums', danger ? 'text-danger' : 'text-text-primary')}>
          {available} / {total}
        </div>
        <div className="mt-1">
          {danger ? (
            <Badge tone="danger">{t('status.OUT_OF_STOCK')}</Badge>
          ) : low ? (
            <Badge tone="warning">{t('status.LOW_STOCK')}</Badge>
          ) : (
            <span className="text-[12px] text-text-tertiary">{t('inventory.inStock')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
