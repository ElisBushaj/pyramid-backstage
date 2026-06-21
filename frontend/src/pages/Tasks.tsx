import { useMemo, useState } from 'react'
import { CircleCheckBig, Plus, TriangleAlert } from 'lucide-react'
import { useRequests, useTasks, useAllTasks } from '@/api/hooks'
import type { EventRequest } from '@/api/types/requests'
import type { Task } from '@/api/types/tasks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl'
import { TaskBoard } from '@/components/command/TaskBoard'
import { ErrorState } from '@/components/ui/Feedback'

const ALL = '__all__'

function isOverdue(task: Task): boolean {
  return !!task.dueAt && task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now()
}

export default function Tasks() {
  const t = useT()
  const { data: requests } = useRequests({ pageSize: 100 })
  const withPlans = useMemo<EventRequest[]>(
    () => (requests ?? []).filter((r) => r.status !== 'DRAFT'),
    [requests],
  )

  // /tasks is cross-event. When ALL is selected, fetch tasks for every active
  // request and merge; otherwise fetch for the chosen request only.
  const [scope, setScope] = useState<string>(ALL)
  const allIds = useMemo(() => withPlans.map((r) => r.id), [withPlans])
  const allTasksQuery = useAllTasks(scope === ALL ? allIds : [])
  const singleTaskQuery = useTasks(scope !== ALL ? scope : undefined)
  const { data: tasks, isLoading, isError, refetch } =
    scope === ALL ? allTasksQuery : singleTaskQuery

  const options: SegmentedOption[] = [
    { label: t('tasks.allEvents'), value: ALL },
    ...withPlans.slice(0, 4).map((r) => ({ label: r.title, value: r.id })),
  ]

  const overdueCount = (tasks ?? []).filter(isOverdue).length
  const hasTasks = !!tasks && tasks.length > 0

  const subtitle = hasTasks
    ? overdueCount > 0
      ? t('tasks.subtitleOverdue', { n: overdueCount })
      : t('tasks.subtitleCount', { n: tasks!.length })
    : undefined

  const firstOverdue = (tasks ?? []).find(isOverdue)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.operations'), t('nav.tasks')]}
        title={t('nav.tasks')}
        subtitle={subtitle}
        actions={
          <Button size="sm">
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
            {t('tasks.new')}
          </Button>
        }
        filters={
          withPlans.length > 0 ? (
            <SegmentedControl
              aria-label={t('tasks.filterByEvent')}
              options={options}
              value={scope}
              onChange={setScope}
            />
          ) : undefined
        }
      />

      {overdueCount > 0 && firstOverdue ? (
        <div className="flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-subtle px-4 py-3">
          <TriangleAlert className="mt-px size-4 shrink-0 text-danger" strokeWidth={2} aria-hidden />
          <p className="text-[13px] leading-[18px] text-danger">
            <span className="font-[600]">{firstOverdue.title}</span>
            {' — '}
            {t('tasks.overdueBanner', { n: overdueCount })}
          </p>
        </div>
      ) : null}

      {isError ? (
        <ErrorState
          title={t('tasks.loadError')}
          message={t('tasks.loadErrorBody')}
          action={{ label: t('ui.common.retry'), onClick: () => void refetch() }}
        />
      ) : isLoading ? (
        <TaskBoardSkeleton />
      ) : hasTasks ? (
        <TaskBoard tasks={tasks!} />
      ) : (
        <TasksEmpty title={t('tasks.emptyTitle')} message={t('tasks.emptyBody')} />
      )}
    </div>
  )
}

function TaskBoardSkeleton() {
  return (
    <div className="flex flex-wrap gap-7">
      {[0, 1].map((lane) => (
        <div key={lane} className="min-w-[280px] flex-1">
          <div className="mb-3 h-3.5 w-2/5">
            <div className="skeleton size-full rounded-sm" aria-hidden />
          </div>
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((card) => (
              <div
                key={card}
                className="flex flex-col gap-2.5 rounded-md border border-border-subtle bg-surface p-3.5"
              >
                <div className="skeleton h-2.5 w-1/2 rounded-sm" aria-hidden />
                <div className="skeleton h-3.5 w-[90%] rounded-sm" aria-hidden />
                <div className="skeleton h-3 w-2/5 rounded-sm" aria-hidden />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function TasksEmpty({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface px-6 py-[72px] text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-[12px] bg-success-subtle text-success">
        <CircleCheckBig className="size-[22px]" strokeWidth={2} aria-hidden />
      </div>
      <h3 className="mb-1.5 text-[17px] font-[600] text-text-primary">{title}</h3>
      <p className="mx-auto max-w-[320px] text-[14px] leading-5 text-text-tertiary">{message}</p>
    </div>
  )
}
