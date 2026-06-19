import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-text-tertiary', className)} aria-hidden />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-sm bg-surface-sunken', className)} aria-hidden />
}

export function EmptyState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-subtle bg-surface-subtle px-6 py-14 text-center">
      <p className="text-[14px] text-text-secondary">{title}</p>
      {action && onAction ? (
        <Button size="sm" variant="secondary" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  )
}

export function ErrorState({ title, onRetry, retryLabel }: { title: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger-subtle bg-danger-subtle px-6 py-14 text-center">
      <p className="text-[14px] text-danger">{title}</p>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </Button>
      ) : null}
    </div>
  )
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
