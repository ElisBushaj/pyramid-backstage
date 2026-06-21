import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { Sparkles, CheckCircle2, ChevronRight } from 'lucide-react'
import {
  useRequest,
  usePlan,
  useMe,
  useApprove,
  useReject,
  useSpaces,
  useAssets,
  useUpdateTask,
} from '@/api/hooks'
import { FloorMapPanel, deriveFloorStatuses } from '@/components/command/FloorMap'
import { APIError } from '@/api/api-error'
import { useMutationToast } from '@/lib/apiError'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDate, formatDateRange } from '@/lib/format'
import type { RequestAggregate } from '@/api/types/requests'
import type { Space } from '@/api/types/spaces'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Dialog, DialogTrigger, DialogContent, DialogClose } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Skeleton, ErrorState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { ConflictBanner } from '@/components/command/ConflictBanner'
import { SpaceCard } from '@/components/command/SpaceCard'
import { ReservationCard } from '@/components/command/ReservationCard'
import { QuoteTable } from '@/components/command/QuoteTable'
import { TaskBoard } from '@/components/command/TaskBoard'
import { AuditTimeline } from '@/components/command/AuditTimeline'

export default function RequestDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const { toast } = useToast()
  const locale = useLocaleStore((s) => s.locale)
  const { data, isLoading, isError, refetch } = useRequest(id)
  const aiPlan = usePlan(id) // F18 — the AI's narrative; degrades to the templated one when absent
  const { data: me } = useMe()
  const { data: spaces } = useSpaces({})
  const { data: assets } = useAssets({})
  const approve = useApprove(id)
  const reject = useReject(id)
  const updateTask = useUpdateTask()
  const onMutationError = useMutationToast()
  const [reason, setReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)

  // Parity with Approvals: a reason must be at least 3 chars to reject.
  const rejectValid = reason.trim().length >= 3

  // Reset the reason whenever the reject dialog opens, so a stale draft never
  // leaks between attempts.
  useEffect(() => {
    if (rejectOpen) setReason('')
  }, [rejectOpen])

  // Success → scheduled / approved: surface the celebratory toast once.
  useEffect(() => {
    if (approve.isSuccess) {
      toast({ tone: 'success', title: t('plan.approvedToast'), message: t('plan.approvedToastBody') })
    }
  }, [approve.isSuccess, toast, t])

  useEffect(() => {
    if (reject.isSuccess) {
      toast({ tone: 'info', title: t('plan.rejectedToast') })
    }
  }, [reject.isSuccess, toast, t])

  // A hold can lapse while the manager reads the plan — schedule a re-render at
  // expiry so "Feasible — ready to approve" flips to not-feasible instead of
  // staying stale (review). The 410 toast on approve is the backstop.
  const [, setExpiryTick] = useState(0)
  const reservationExpiresAt = data?.reservation?.expiresAt
  useEffect(() => {
    if (!reservationExpiresAt) return
    const ms = new Date(reservationExpiresAt).getTime() - Date.now()
    if (ms <= 0) return
    const timer = setTimeout(() => setExpiryTick((n) => n + 1), ms + 500)
    return () => clearTimeout(timer)
  }, [reservationExpiresAt])

  if (isLoading) return <PlanSkeleton t={t} />
  if (isError || !data)
    return (
      <ErrorState
        title={t('error.title')}
        message={t('plan.loadError')}
        onRetry={() => refetch()}
        retryLabel={t('ui.common.retry')}
      />
    )

  const { request, reservation, quote, tasks, conflicts, audit } = data
  const space = spaces?.find((s) => s.id === reservation?.spaceId)
  const spaceName = space?.name ?? reservation?.spaceId ?? '—'

  const canApprove = me?.role === 'MANAGER' || me?.role === 'ADMIN'
  const approvable = request.status === 'PROPOSED'
  const approveErr = approve.error instanceof APIError ? approve.error : undefined
  // Conflicts can ride on the aggregate OR surface from a 409 approve attempt.
  const allConflicts = [...conflicts, ...(approveErr?.status === 409 ? approveErr.conflicts ?? [] : [])]
  const hasConflict = allConflicts.length > 0
  // A held reservation is only feasible while its hold is still live — an expired
  // hold can't be approved, so it must not read as "ready to approve".
  const holdLive = !!reservation && (!reservation.expiresAt || new Date(reservation.expiresAt).getTime() > Date.now())
  const feasible = !hasConflict && holdLive
  const submitting = approve.isPending

  const subtitle = [
    `${request.expectedAttendees} ${t('requests.attendees').toLowerCase()}`,
    titleCase(request.eventType),
    request.preferredDates[0] ? formatDate(request.preferredDates[0].start, locale) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const scheduled = request.status === 'SCHEDULED' || request.status === 'APPROVED'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.pipeline'), t('nav.requests'), shortId(request.id)]}
        title={request.title}
        subtitle={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusBadge status={request.status} />
            {scheduled ? (
              <span className="text-[13px] text-success">{t('plan.scheduledConfirmed')}</span>
            ) : null}
            {approvable ? (
              <>
                {canApprove ? (
                  <Button
                    loading={submitting}
                    onClick={() =>
                      approve.mutate(undefined, {
                        // A REAL conflict (409 carrying conflicts) renders via the
                        // ConflictBanner; every other failure — a 409 invalid_transition
                        // (e.g. a peer already approved it), 410 hold-expired, 429, 403,
                        // 5xx — toasts AND refetches so the stale status updates.
                        onError: (err) => {
                          if (err instanceof APIError && err.status === 409 && (err.conflicts?.length ?? 0) > 0) return
                          onMutationError(err)
                          void refetch()
                        },
                      })
                    }
                  >
                    {submitting ? t('plan.approving') : t('plan.approve')}
                  </Button>
                ) : (
                  <Tooltip label={t('plan.forbidden')}>
                    <span tabIndex={0}>
                      <Button disabled>{t('plan.approve')}</Button>
                    </span>
                  </Tooltip>
                )}
                {canApprove ? (
                  <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                    <DialogTrigger asChild>
                      <Button variant="secondary" disabled={submitting}>
                        {t('plan.reject')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent title={t('plan.rejectTitle')} size="sm">
                      <FormField
                        label={t('field.reason')}
                        hint={t('plan.rejectReasonHint')}
                      >
                        <Textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={t('plan.rejectReasonPlaceholder')}
                          rows={3}
                        />
                      </FormField>
                      <div className="mt-5 flex justify-end gap-2.5">
                        <DialogClose asChild>
                          <Button variant="secondary" size="md">
                            {t('ui.common.cancel')}
                          </Button>
                        </DialogClose>
                        <Button
                          variant="danger"
                          size="md"
                          loading={reject.isPending}
                          disabled={!rejectValid}
                          onClick={() =>
                            reject.mutate(reason.trim(), {
                              onSuccess: () => setRejectOpen(false),
                              onError: onMutationError,
                            })
                          }
                        >
                          {reject.isPending ? t('plan.rejecting') : t('plan.reject')}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Tooltip label={t('plan.forbidden')}>
                    <span tabIndex={0}>
                      <Button variant="secondary" disabled>
                        {t('plan.reject')}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </>
            ) : null}
          </div>
        }
      />

      {/* Copilot narrative — the headline of the plan view (F18: live AI narrative when present). */}
      <PlanNarrative
        feasible={feasible}
        hasConflict={hasConflict}
        t={t}
        aiNarrative={aiPlan.data?.narrative}
        space={space}
        request={request}
      />

      {/* Feasibility band: conflict → ConflictBanner + alternatives; else ready strip. */}
      {hasConflict ? (
        <>
          <ConflictBanner
            conflicts={allConflicts}
            actions={
              <>
                <Button variant="primary" size="md" onClick={() => scrollToAlternatives()}>
                  {t('conflict.seeAlternatives')}
                  <ChevronRight className="size-[13px]" strokeWidth={1.8} />
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => navigate('/requests/new', { state: { prefillFrom: request } })}
                >
                  {t('conflict.adjust')}
                </Button>
              </>
            }
          />
          <Alternatives spaces={spaces} request={data} t={t} />
        </>
      ) : feasible ? (
        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success-subtle px-4 py-3 text-[13px] text-success">
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.8} />
          {t('plan.feasible')}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3 text-[13px] text-text-secondary">
          {t('plan.noReservation')}
        </div>
      )}

      {/* F19 — the plan, lit on the actual Pyramid: chosen space + bundle + any conflict. */}
      {(reservation || hasConflict) && (
        <FloorMapPanel
          spaces={deriveFloorStatuses(spaces ?? [], {
            chosenSpaceId: reservation?.spaceId,
            conflictSpaceIds: allConflicts.map((c) => c.spaceId).filter((x): x is string => !!x),
            plan: aiPlan.data,
          })}
        />
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('plan.tabOverview')}</TabsTrigger>
          <TabsTrigger value="quote">{t('plan.quote')}</TabsTrigger>
          <TabsTrigger value="tasks">{t('plan.tasks')}</TabsTrigger>
          <TabsTrigger value="audit">{t('plan.audit')}</TabsTrigger>
        </TabsList>

        {/* Overview: space + reservation, then a compact quote + tasks preview. */}
        <TabsContent value="overview" className="pt-6">
          <div className="flex flex-col gap-6">
            {reservation || space ? (
              <div className="flex flex-wrap gap-5">
                {space ? <PlanSpaceCard space={space} request={request} feasible={feasible} t={t} /> : null}
                {reservation ? (
                  <ReservationCard
                    space={spaceName}
                    window={formatDateRange(reservation.dateRange.start, reservation.dateRange.end, locale)}
                    status={reservation.status}
                    expiresAt={reservation.expiresAt}
                    assets={reservation.assets.map((a) => ({
                      name: assets?.find((x) => x.id === a.assetId)?.name ?? a.assetId,
                      qty: a.quantity,
                    }))}
                  />
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-[13px] text-text-tertiary">
                {t('plan.noReservation')}
              </div>
            )}

            {quote ? (
              <section className="rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised">
                <div className="mb-3.5 flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-[600] text-text-primary">
                    {t('plan.quote')}{' '}
                    <span className="font-mono text-[12px] text-text-tertiary">v{quote.version}</span>
                  </h2>
                  <StatusBadge status={quote.status} />
                </div>
                <QuoteTable quote={quote} />
              </section>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="quote" className="pt-6">
          {quote ? (
            <section className="rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised">
              <div className="mb-3.5 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-[600] text-text-primary">
                  {t('plan.quote')}{' '}
                  <span className="font-mono text-[12px] text-text-tertiary">v{quote.version}</span>
                </h2>
                <StatusBadge status={quote.status} />
              </div>
              <QuoteTable quote={quote} />
            </section>
          ) : (
            <p className="rounded-lg border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-[13px] text-text-tertiary">
              {t('plan.noQuote')}
            </p>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="pt-6">
          <section className="rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised">
            <h2 className="mb-3.5 text-[15px] font-[600] text-text-primary">{t('plan.tasksTitle')}</h2>
            {tasks.length ? (
              <TaskBoard
                tasks={tasks}
                onStatusChange={(taskId, requestId, next) =>
                  updateTask.mutate({ id: taskId, requestId, body: { status: next } })
                }
                savingTaskId={updateTask.isPending ? updateTask.variables?.id : null}
              />
            ) : (
              <p className="text-[13px] text-text-tertiary">{t('plan.noTasks')}</p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="audit" className="pt-6">
          <section className="rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised">
            <h2 className="mb-4 text-[15px] font-[600] text-text-primary">{t('plan.audit')}</h2>
            <AuditTimeline entries={audit} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ── Copilot narrative card ──────────────────────────────────────────────── */

function PlanNarrative({
  feasible,
  hasConflict,
  t,
  aiNarrative,
  space,
  request,
}: {
  feasible: boolean
  hasConflict: boolean
  t: ReturnType<typeof useT>
  aiNarrative?: string
  space?: Space
  request: RequestAggregate['request']
}) {
  // F18 — prefer the AI's deterministic narrative when present. Otherwise derive a
  // request-agnostic narrative from the real aggregate (XC-1): the templated
  // "Blue Hall seats 180" line lied for every request, so the feasible fallback
  // is now parameterized from the reserved space + requested-layout capacity.
  const layout = request.requirements?.layout ?? 'THEATER'
  const capacity = space ? space.capacities[layout] ?? Math.max(0, ...Object.values(space.capacities)) : 0
  const feasibleBody = space
    ? t('plan.narrativeFeasibleGeneric', {
        space: space.name,
        capacity,
        attendees: request.expectedAttendees,
      })
    : t('plan.narrativePending')

  const body = aiNarrative
    ? aiNarrative
    : hasConflict
      ? t('plan.narrativeNotFeasible')
      : feasible
        ? feasibleBody
        : t('plan.narrativePending')

  // The note clarifies a derived narrative is a deterministic fallback, not the AI.
  const derived = !aiNarrative
  return (
    <section className="rounded-lg border border-[#DCE6FB] bg-[#F7F9FE] p-[18px_20px]">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-[7px] bg-accent text-text-on-accent">
          <Sparkles className="size-[14px]" strokeWidth={1.8} aria-hidden />
        </span>
        <span className="text-[13px] font-[600] text-accent">{t('plan.copilotPlan')}</span>
      </div>
      <p className="text-[15px] leading-[23px] text-text-primary">{body}</p>
      {derived ? (
        <p className="mt-2 text-[12px] text-text-tertiary">{t('plan.narrativeDerivedNote')}</p>
      ) : null}
    </section>
  )
}

/* ── SpaceCard adapter from the reserved Space ───────────────────────────── */

function PlanSpaceCard({
  space,
  request,
  feasible,
  t,
}: {
  space: Space
  request: RequestAggregate['request']
  feasible: boolean
  t: ReturnType<typeof useT>
}) {
  const layout = request.requirements?.layout ?? 'THEATER'
  const capacity = space.capacities[layout] ?? Math.max(0, ...Object.values(space.capacities))
  return (
    <SpaceCard
      name={space.name}
      floor={`${t('spaces.floor')} ${space.floor}`}
      capacity={capacity}
      layout={titleCase(layout)}
      features={space.features}
      rate={new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(space.dayRateMinor)}
      availability={feasible ? 'held' : 'free'}
    />
  )
}

/* ── Alternatives (not-feasible path) ────────────────────────────────────── */

function Alternatives({
  spaces,
  request,
  t,
}: {
  spaces: Space[] | undefined
  request: RequestAggregate
  t: ReturnType<typeof useT>
}) {
  const layout = request.request.requirements?.layout ?? 'THEATER'
  const needed = request.request.expectedAttendees
  const takenId = request.reservation?.spaceId
  const alts = (spaces ?? [])
    .filter((s) => s.id !== takenId && s.status === 'ACTIVE')
    .filter((s) => (s.capacities[layout] ?? Math.max(0, ...Object.values(s.capacities))) >= needed)
    .slice(0, 2)

  if (!alts.length) return null

  return (
    <div id="plan-alternatives" className="flex flex-col gap-2.5">
      <h2 className="text-[13px] font-[600] text-text-secondary">{t('plan.alternatives')}</h2>
      <div className="flex flex-wrap gap-3.5">
        {alts.map((s, i) => {
          const recommended = i === 0
          const cap = s.capacities[layout] ?? Math.max(0, ...Object.values(s.capacities))
          return (
            <div
              key={s.id}
              className={
                'flex min-w-[200px] flex-1 flex-col gap-3 rounded-md border p-3.5 ' +
                (recommended ? 'border-accent bg-[#F7F9FE]' : 'border-border-subtle bg-surface')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-[600] text-text-primary">{s.name}</span>
                {recommended ? <Badge tone="info">{t('plan.recommended')}</Badge> : null}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[24px] font-[600] tabular-nums text-text-primary">{cap}</span>
                <span className="text-[12px] text-text-tertiary">{titleCase(layout)}</span>
              </div>
              <p className="text-[12px] text-text-tertiary">{t('plan.alternativeFitsHint')}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Loading skeleton (POST /plan) ───────────────────────────────────────── */

function PlanSkeleton({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>

      <section className="flex flex-col gap-2.5 rounded-lg border border-[#DCE6FB] bg-[#F7F9FE] p-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-block size-4 shrink-0 rounded-pill border-2 border-[#DCE6FB] border-t-accent [animation:spin-ring_700ms_linear_infinite]"
            aria-hidden
          />
          <span className="text-[14px] font-[550] text-accent">{t('plan.copilotBuilding')}</span>
        </div>
        <Skeleton className="h-3 w-[90%]" />
        <Skeleton className="h-3 w-[70%]" />
      </section>

      <div className="flex flex-wrap gap-5">
        <Skeleton className="h-[150px] w-[280px] rounded-lg" />
        <Skeleton className="h-[150px] w-[300px] rounded-lg" />
      </div>
    </div>
  )
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

function shortId(id: string): string {
  // REQ-2026-0142 stays as-is; bare UUIDs collapse to a short prefix.
  return id.length > 16 ? `REQ-${id.slice(0, 8)}` : id
}

function scrollToAlternatives() {
  document.getElementById('plan-alternatives')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
