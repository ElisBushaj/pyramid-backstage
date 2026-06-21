import { useMemo, useState } from 'react'
import { CircleCheckBig, Plus, TriangleAlert } from 'lucide-react'
import { useRequests, useTasks, useAllTasks, useUpdateTask, usePersistTasks } from '@/api/hooks'
import type { EventRequest } from '@/api/types/requests'
import type { Task, TaskPhase, TaskStatus } from '@/api/types/tasks'
import { useT } from '@/i18n/useT'
import { useMutationToast } from '@/lib/apiError'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Input, Select } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { TaskBoard } from '@/components/command/TaskBoard'
import { ErrorState } from '@/components/ui/Feedback'

const ALL = '__all__'

const PHASES: TaskPhase[] = ['SETUP', 'TEARDOWN']

interface NewTaskForm {
  title: string
  phase: TaskPhase
  owner: string
  dueOffsetHours: string
}

const EMPTY_NEW_TASK: NewTaskForm = { title: '', phase: 'SETUP', owner: '', dueOffsetHours: '' }

function isOverdue(task: Task): boolean {
  return !!task.dueAt && task.status !== 'DONE' && new Date(task.dueAt).getTime() < Date.now()
}

export default function Tasks() {
  const t = useT()
  const onError = useMutationToast()
  const { data: requests } = useRequests({ pageSize: 100 })
  // Paginated envelope (ADR-0017): rows live under `.data`, meta on the envelope.
  const withPlans = useMemo<EventRequest[]>(
    () => (requests?.data ?? []).filter((r) => r.status !== 'DRAFT'),
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

  const updateTask = useUpdateTask()
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null)

  function changeStatus(id: string, requestId: string, next: TaskStatus) {
    setSavingTaskId(id)
    updateTask.mutate(
      { id, requestId, body: { status: next } },
      {
        onError,
        onSettled: () => setSavingTaskId((cur) => (cur === id ? null : cur)),
      },
    )
  }

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

  // Create-task is scoped to one concrete request: the picked scope, or the first
  // active plan when ALL is selected (the dialog also carries a request picker).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NewTaskForm>(EMPTY_NEW_TASK)
  const [targetRequestId, setTargetRequestId] = useState<string>('')
  const persist = usePersistTasks(targetRequestId)

  function openCreate() {
    const initial = scope !== ALL ? scope : (withPlans[0]?.id ?? '')
    setTargetRequestId(initial)
    setForm(EMPTY_NEW_TASK)
    setDialogOpen(true)
  }

  const offsetRaw = form.dueOffsetHours.trim()
  const offsetValue = offsetRaw === '' ? undefined : Number(offsetRaw)
  const offsetValid = offsetValue === undefined || Number.isFinite(offsetValue)
  const createValid = !!targetRequestId && !!form.title.trim() && offsetValid

  function submitCreate() {
    if (!createValid) return
    persist.mutate(
      [
        {
          title: form.title.trim(),
          phase: form.phase,
          ...(form.owner.trim() ? { owner: form.owner.trim() } : {}),
          ...(offsetValue !== undefined ? { dueOffsetHours: offsetValue } : {}),
        },
      ],
      {
        onSuccess: () => setDialogOpen(false),
        onError,
      },
    )
  }

  const canCreate = withPlans.length > 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.operations'), t('nav.tasks')]}
        title={t('nav.tasks')}
        subtitle={subtitle}
        actions={
          <Button size="sm" onClick={openCreate} disabled={!canCreate}>
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
        <TaskBoard tasks={tasks!} savingTaskId={savingTaskId} onStatusChange={changeStatus} />
      ) : (
        <TasksEmpty title={t('tasks.emptyTitle')} message={t('tasks.emptyBody')} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {dialogOpen ? (
          <DialogContent title={t('tasks.newTitle')}>
            <div className="flex flex-col gap-3.5">
              <FormField label={t('tasks.newEvent')}>
                <Select
                  value={targetRequestId}
                  onChange={(e) => setTargetRequestId(e.target.value)}
                >
                  {withPlans.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('tasks.newTaskTitle')}>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  autoFocus
                />
              </FormField>
              <FormField label={t('tasks.newPhase')}>
                <Select
                  value={form.phase}
                  onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value as TaskPhase }))}
                >
                  {PHASES.map((p) => (
                    <option key={p} value={p}>
                      {t(`tasks.${p === 'SETUP' ? 'setup' : 'teardown'}`)}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('tasks.newOwner')}>
                <Input
                  value={form.owner}
                  onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                />
              </FormField>
              <FormField label={t('tasks.newDueOffset')} hint={t('tasks.newDueOffsetHint')}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.dueOffsetHours}
                  onChange={(e) => setForm((f) => ({ ...f, dueOffsetHours: e.target.value }))}
                  suffix={t('tasks.newDueOffsetSuffix')}
                />
              </FormField>
              <div className="mt-1 flex justify-end gap-2.5">
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  {t('ui.common.cancel')}
                </Button>
                <Button loading={persist.isPending} disabled={!createValid} onClick={submitCreate}>
                  {t('tasks.newSubmit')}
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
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
