import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Feedback'

export function KPIStat({ label, value, delta, hint, loading }: { label: string; value?: number | string; delta?: number | null; hint?: string; loading?: boolean }) {
  return (
    <Card className="px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-[550] uppercase tracking-[0.02em] text-text-tertiary">{label}</span>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[28px] font-[600] tabular-nums leading-none text-text-primary">{value ?? '—'}</span>
            {typeof delta === 'number' && delta !== 0 ? (
              <span className={cn('flex items-center text-[12px] font-[550]', delta > 0 ? 'text-success' : 'text-danger')}>
                {delta > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {Math.abs(delta)}
              </span>
            ) : null}
          </div>
        )}
        {hint ? <span className="text-[12px] text-text-tertiary">{hint}</span> : null}
      </div>
    </Card>
  )
}
