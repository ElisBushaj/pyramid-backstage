import { Badge, type BadgeTone } from './Badge'
import { useT } from '@/i18n/useT'

// Status → token mapping from DESIGN_SYSTEM.md §2.1 (used everywhere, consistently).
const TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral', PROPOSED: 'warning', APPROVED: 'success', SCHEDULED: 'info', COMPLETED: 'success', REJECTED: 'danger',
  HELD: 'warning', CONFIRMED: 'success', RELEASED: 'neutral', CONFLICT: 'danger',
  TODO: 'neutral', IN_PROGRESS: 'info', DONE: 'success', BLOCKED: 'danger',
  ACTIVE: 'success', MAINTENANCE: 'warning', RETIRED: 'neutral',
  SENT: 'info', ACCEPTED: 'success', EXPIRED: 'danger',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useT()
  return (
    <Badge tone={TONE[status] ?? 'neutral'} dot className={className}>
      {t(`status.${status}`)}
    </Badge>
  )
}
