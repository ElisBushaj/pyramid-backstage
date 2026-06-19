import { cn } from '@/lib/cn'

/** available/total bar; held portion in warning, crosses to danger when low. */
export function InventoryMeter({ available, total }: { available: number; total: number }) {
  const pctAvail = total > 0 ? Math.max(0, Math.min(100, (available / total) * 100)) : 0
  const low = total > 0 && available <= total * 0.1
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
        <div className={cn('h-full rounded-pill transition-[width]', low ? 'bg-danger' : 'bg-success')} style={{ width: `${pctAvail}%` }} />
      </div>
      <span className={cn('shrink-0 font-mono text-[13px] tabular-nums', low ? 'text-danger' : 'text-text-secondary')}>
        {available}/{total}
      </span>
    </div>
  )
}
