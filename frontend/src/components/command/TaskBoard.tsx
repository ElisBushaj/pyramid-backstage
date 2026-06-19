import type { Task } from '@/api/types/tasks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateTime } from '@/lib/format'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const t = useT()
  const setup = tasks.filter((x) => x.phase === 'SETUP')
  const teardown = tasks.filter((x) => x.phase === 'TEARDOWN')
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Lane title={t('tasks.setup')} tasks={setup} />
      <Lane title={t('tasks.teardown')} tasks={teardown} />
    </div>
  )
}

function Lane({ title, tasks }: { title: string; tasks: Task[] }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-[600] uppercase tracking-[0.02em] text-text-tertiary">{title}</span>
        <span className="font-mono text-[12px] text-text-tertiary">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border-subtle px-3 py-4 text-center text-[13px] text-text-tertiary">{t('tasks.empty')}</p>
      ) : (
        tasks.map((task) => {
          const overdue = task.dueAt && new Date(task.dueAt).getTime() < Date.now() && task.status !== 'DONE'
          return (
            <div key={task.id} className="flex flex-col gap-1.5 rounded-md border border-border-subtle bg-surface px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-[550] text-text-primary">{task.title}</span>
                <StatusBadge status={task.status} />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                {task.owner ? <span>{task.owner}</span> : null}
                {task.dueAt ? <span className={overdue ? 'font-[550] text-danger' : ''}>· {formatDateTime(task.dueAt, locale)}</span> : null}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
