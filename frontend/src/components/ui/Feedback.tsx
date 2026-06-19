import type { ReactNode } from 'react'
import { AlertTriangle, CalendarDays, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

const SPINNER_TONE = {
  accent: 'border-accent/30 border-t-accent',
  tertiary: 'border-text-tertiary/30 border-t-text-tertiary',
  'on-accent': 'border-white/40 border-t-white',
} as const

/**
 * Spinner — §2.14. A 2px ring rotated 700ms linear (spin-ring keyframe), matching
 * the in-button spinner. `size` is px (canvas shows 16 accent + 22 tertiary).
 */
export function Spinner({
  className,
  size = 16,
  tone = 'tertiary',
}: {
  className?: string
  size?: number
  tone?: keyof typeof SPINNER_TONE
}) {
  return (
    <span
      role="status"
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 rounded-pill border-2 [animation:spin-ring_700ms_linear_infinite]',
        SPINNER_TONE[tone],
        className,
      )}
    />
  )
}

/**
 * Skeleton — §2.14. The global `.skeleton` utility (gradient sheen sweep, not a
 * pulse). Pass width/height via className.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

/**
 * Shared feedback-card shape (§3.14 `ee()`): dashed border-strong on white,
 * rounded-lg, 40px/28px padding, centered. A 44×44 rounded-[11px] icon tile,
 * 16/600 title, 14/20 tertiary message capped at 280px, and a centered action.
 * ErrorState stays CALM — danger lives ONLY in the icon tile, never the body.
 */
type FeedbackAction = ReactNode | { label: string; onClick?: () => void }

function FeedbackCard({
  title,
  message,
  icon: Icon,
  tileClassName,
  action,
}: {
  title: string
  message?: ReactNode
  icon: LucideIcon
  tileClassName: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-surface p-[40px_28px] text-center">
      <div className={cn('mx-auto mb-4 flex size-11 items-center justify-center rounded-[11px]', tileClassName)}>
        <Icon className="size-5" strokeWidth={2} aria-hidden />
      </div>
      <h3 className="mb-1.5 text-[16px] font-semibold text-text-primary">{title}</h3>
      {message ? (
        <p className="mx-auto mb-[18px] max-w-[280px] text-[14px] leading-5 text-text-tertiary">{message}</p>
      ) : null}
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  )
}

function resolveAction(
  action: FeedbackAction | undefined,
  legacy: { label?: string; onClick?: () => void } | undefined,
): ReactNode {
  if (action && typeof action === 'object' && 'label' in action && !('type' in action)) {
    return (
      <Button size="sm" variant="secondary" onClick={action.onClick}>
        {action.label}
      </Button>
    )
  }
  if (action) return action as ReactNode
  if (legacy?.label) {
    return (
      <Button size="sm" variant="secondary" onClick={legacy.onClick}>
        {legacy.label}
      </Button>
    )
  }
  return null
}

/**
 * EmptyState — §3.14. Illustrationless, calm "nothing needs you" card with a
 * surface-sunken icon tile and a helpful first action. Backward compatible with
 * the legacy `action: string` + `onAction` call shape.
 */
export function EmptyState({
  title,
  message,
  icon = CalendarDays,
  action,
  onAction,
}: {
  title: string
  message?: ReactNode
  icon?: LucideIcon
  action?: FeedbackAction
  onAction?: () => void
}) {
  const legacy = typeof action === 'string' ? { label: action, onClick: onAction } : undefined
  return (
    <FeedbackCard
      title={title}
      message={message}
      icon={icon}
      tileClassName="bg-surface-sunken text-text-tertiary"
      action={resolveAction(typeof action === 'string' ? undefined : action, legacy)}
    />
  )
}

/**
 * ErrorState — §3.14. CALM by design: dashed border-strong on white with a
 * TERTIARY message; danger is confined to the icon tile. Backward compatible
 * with the legacy `onRetry` + `retryLabel` call shape.
 */
export function ErrorState({
  title,
  message,
  icon = AlertTriangle,
  action,
  onRetry,
  retryLabel,
}: {
  title: string
  message?: ReactNode
  icon?: LucideIcon
  action?: FeedbackAction
  onRetry?: () => void
  retryLabel?: string
}) {
  const legacy = onRetry ? { label: retryLabel ?? 'Retry', onClick: onRetry } : undefined
  return (
    <FeedbackCard
      title={title}
      message={message}
      icon={icon}
      tileClassName="bg-danger-subtle text-danger"
      action={resolveAction(action, legacy)}
    />
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
