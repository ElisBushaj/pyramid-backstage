import { Plus, Minus } from 'lucide-react'
import type { Task, TaskStatus, TaskPhase } from '@/api/types/tasks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatRelative, formatDate, formatTime } from '@/lib/format'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Feedback'

/**
 * TaskBoard — §3.8. SETUP / TEARDOWN lanes. Each task card shows owner avatar +
 * relative due time on the left and a noDot status badge on the right. OVERDUE is
 * a derived display state (past due & not DONE): danger time + danger-tinted
 * border + an OVERDUE badge — distinct from the contract's BLOCKED status.
 *
 * When `onStatusChange` is supplied the status badge becomes a click-to-advance
 * control (TODO → IN_PROGRESS → DONE → TODO); without it the badge stays a static
 * read-only label so other (read-only) board usages are unaffected.
 */

/** Click-to-advance cycle. BLOCKED/OVERDUE advance to IN_PROGRESS (the unblock step). */
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'TODO',
  BLOCKED: 'IN_PROGRESS',
}

const CYCLE_KEY: Record<TaskStatus, string> = {
  TODO: 'tasks.markInProgress',
  IN_PROGRESS: 'tasks.markDone',
  DONE: 'tasks.markTodo',
  BLOCKED: 'tasks.markInProgress',
}

// Status → badge tone (canvas §3.8: BLOCKED = warning, not danger).
const STATUS_TONE: Record<TaskStatus | 'OVERDUE', BadgeTone> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  DONE: 'success',
  BLOCKED: 'warning',
  OVERDUE: 'danger',
}

// Avatar tints from the canvas palette, picked deterministically per owner so
// real (untagged) task data still gets a stable, varied colour.
const AVATAR_TINTS = [
  'bg-[#DCE6FB]', // blue
  'bg-success-subtle', // green
  'bg-warning-subtle', // amber
  'bg-accent-muted', // info
  'bg-surface-sunken', // gray
]

function isOverdue(task: Task): boolean {
  return !!task.dueAt && task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now()
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

export function TaskBoard({
  tasks,
  savingTaskId,
  onStatusChange,
}: {
  tasks: Task[]
  savingTaskId?: string | null
  onStatusChange?: (taskId: string, requestId: string, next: TaskStatus) => void
}) {
  const t = useT()
  const setup = tasks.filter((x) => x.phase === 'SETUP')
  const teardown = tasks.filter((x) => x.phase === 'TEARDOWN')
  return (
    <div className="flex flex-wrap gap-7">
      <Lane phase="SETUP" title={t('tasks.setup')} tasks={setup} savingTaskId={savingTaskId} onStatusChange={onStatusChange} />
      <Lane phase="TEARDOWN" title={t('tasks.teardown')} tasks={teardown} savingTaskId={savingTaskId} onStatusChange={onStatusChange} />
    </div>
  )
}

function Lane({
  phase,
  title,
  tasks,
  savingTaskId,
  onStatusChange,
}: {
  phase: TaskPhase
  title: string
  tasks: Task[]
  savingTaskId?: string | null
  onStatusChange?: (taskId: string, requestId: string, next: TaskStatus) => void
}) {
  const t = useT()
  const Icon = phase === 'SETUP' ? Plus : Minus
  return (
    <div className="min-w-[280px] flex-1">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-text-secondary" strokeWidth={1.75} aria-hidden />
        <span className="text-[13px] font-[600] uppercase tracking-[0.04em] text-text-secondary">{title}</span>
        <span className="rounded-pill bg-surface-sunken px-2 py-px font-mono text-[12px] tabular-nums text-text-tertiary">
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-subtle px-3 py-4 text-center text-[13px] text-text-tertiary">
          {t('tasks.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} saving={task.id === savingTaskId} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task,
  saving = false,
  onStatusChange,
}: {
  task: Task
  saving?: boolean
  onStatusChange?: (taskId: string, requestId: string, next: TaskStatus) => void
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const overdue = isOverdue(task)
  const displayStatus: TaskStatus | 'OVERDUE' = overdue ? 'OVERDUE' : task.status
  const owner = task.owner ?? null
  const interactive = !!onStatusChange
  return (
    <div
      className={
        'rounded-md bg-surface p-3 shadow-raised ' +
        (overdue ? 'border border-[rgba(200,55,45,0.3)]' : 'border border-border-subtle')
      }
    >
      {task.requestId ? (
        <p className="mb-1.5 font-mono text-[11px] text-accent">{task.requestId}</p>
      ) : null}
      <p className="mb-2.5 text-[14px] font-[500] leading-[19px] text-text-primary">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {owner ? (
            <Avatar size="sm" initials={initials(owner)} fallbackClassName={tintFor(owner)} aria-label={owner} />
          ) : null}
          {task.dueAt ? (
            <span
              className={
                overdue
                  ? 'text-[12px] font-[600] text-danger'
                  : 'text-[12px] font-[400] text-text-tertiary'
              }
            >
              {formatRelative(task.dueAt, locale)}
            </span>
          ) : null}
        </div>
        {saving ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-[600] text-accent">
            <Spinner size={12} tone="accent" />
            {t('ui.common.loading')}
          </span>
        ) : interactive ? (
          <button
            type="button"
            aria-label={t(CYCLE_KEY[task.status])}
            title={t(CYCLE_KEY[task.status])}
            onClick={() => onStatusChange!(task.id, task.requestId, NEXT_STATUS[task.status])}
            className="rounded-pill outline-none transition-[box-shadow,opacity] duration-micro ease-std hover:opacity-80 focus-visible:shadow-ring-soft"
          >
            <Badge tone={STATUS_TONE[displayStatus]}>{t(`status.${displayStatus}`)}</Badge>
          </button>
        ) : (
          <Badge tone={STATUS_TONE[displayStatus]}>{t(`status.${displayStatus}`)}</Badge>
        )}
      </div>
      {task.dueAt ? (
        <p className="mt-2 font-mono text-[11px] text-text-tertiary">
          {`${formatDate(task.dueAt, locale)} · ${formatTime(task.dueAt, locale)}`}
        </p>
      ) : null}
    </div>
  )
}
