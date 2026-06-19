import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { useRequest, useMe, useApprove, useReject, useSpaces } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateRange, formatDateTime } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Dialog, DialogContent, DialogTrigger, DialogClose } from '@/components/ui/Dialog'
import { Textarea } from '@/components/ui/Input'
import { LoadingBlock, ErrorState } from '@/components/ui/Feedback'
import { ConflictBanner } from '@/components/command/ConflictBanner'
import { QuoteTable } from '@/components/command/QuoteTable'
import { TaskBoard } from '@/components/command/TaskBoard'
import { AuditTimeline } from '@/components/command/AuditTimeline'

export default function RequestDetail() {
  const { id = '' } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const locale = useLocaleStore((s) => s.locale)
  const { data, isLoading, isError, refetch } = useRequest(id)
  const { data: me } = useMe()
  const { data: spaces } = useSpaces({})
  const approve = useApprove(id)
  const reject = useReject(id)
  const [reason, setReason] = useState('')

  if (isLoading) return <LoadingBlock rows={6} />
  if (isError || !data) return <ErrorState title={t('error.generic')} onRetry={() => refetch()} retryLabel={t('ui.common.retry')} />

  const { request, reservation, quote, tasks, conflicts, audit } = data
  const spaceName = spaces?.find((s) => s.id === reservation?.spaceId)?.name ?? reservation?.spaceId
  const canApprove = me?.role === 'MANAGER' || me?.role === 'ADMIN'
  const approvable = request.status === 'PROPOSED'
  const approveErr = approve.error instanceof APIError ? approve.error : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.title}
        subtitle={`${request.organizerName} · ${request.expectedAttendees} ${t('requests.attendees').toLowerCase()} · ${request.eventType}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={request.status} />
            {approvable ? (
              <>
                {canApprove ? (
                  <Button loading={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? t('plan.approving') : t('plan.approve')}</Button>
                ) : (
                  <Tooltip label={t('plan.forbidden')}>
                    <span><Button disabled>{t('plan.approve')}</Button></span>
                  </Tooltip>
                )}
                {canApprove ? (
                  <Dialog>
                    <DialogTrigger asChild><Button variant="secondary">{t('plan.reject')}</Button></DialogTrigger>
                    <DialogContent title={t('plan.reject')}>
                      <div className="flex flex-col gap-3">
                        <Textarea placeholder={t('field.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
                        <div className="flex justify-end gap-2">
                          <DialogClose asChild><Button variant="ghost">{t('ui.common.cancel')}</Button></DialogClose>
                          <DialogClose asChild>
                            <Button variant="danger" disabled={reason.trim().length < 3} loading={reject.isPending} onClick={() => reject.mutate(reason)}>{t('plan.reject')}</Button>
                          </DialogClose>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </>
            ) : null}
          </div>
        }
      />

      {/* Feasibility / conflict narrative */}
      {conflicts.length > 0 ? (
        <ConflictBanner conflicts={conflicts} actions={<Button size="sm" variant="secondary" onClick={() => navigate('/requests/new')}>{t('conflict.adjust')}</Button>} />
      ) : reservation ? (
        <div className="flex items-center gap-2 rounded-lg border border-success-subtle bg-success-subtle px-4 py-3 text-[13px] text-success">
          <CheckCircle2 className="size-4" /> {t('plan.feasible')}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-subtle px-4 py-3 text-[13px] text-text-secondary">
          <AlertTriangle className="size-4 text-text-tertiary" /> {t('plan.noReservation')}
        </div>
      )}
      {approveErr?.status === 409 ? <ConflictBanner conflicts={approveErr.conflicts ?? []} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          {reservation ? (
            <Card>
              <CardHeader><CardTitle>{t('plan.reservation')}</CardTitle><StatusBadge status={reservation.status} /></CardHeader>
              <CardBody className="flex flex-col gap-2 text-[14px]">
                <Row label={t('plan.space')} value={spaceName ?? '—'} />
                <Row label={t('spaces.window')} value={formatDateRange(reservation.dateRange.start, reservation.dateRange.end, locale)} mono />
                {reservation.status === 'HELD' && reservation.expiresAt ? <Row label={t('plan.leaseEnds')} value={formatDateTime(reservation.expiresAt, locale)} mono warning /> : null}
                {reservation.assets.length ? <Row label={t('nav.inventory')} value={reservation.assets.map((a) => `${a.quantity}×`).join('  ')} mono /> : null}
              </CardBody>
            </Card>
          ) : null}

          {quote ? (
            <Card>
              <CardHeader><CardTitle>{t('plan.quote')} <span className="font-mono text-[12px] text-text-tertiary">v{quote.version}</span></CardTitle><StatusBadge status={quote.status} /></CardHeader>
              <CardBody><QuoteTable quote={quote} /></CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>{t('plan.tasks')}</CardTitle></CardHeader>
            <CardBody>{tasks.length ? <TaskBoard tasks={tasks} /> : <p className="text-[13px] text-text-tertiary">{t('plan.noTasks')}</p>}</CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>{t('plan.audit')}</CardTitle></CardHeader>
          <CardBody><AuditTimeline entries={audit} /></CardBody>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, mono, warning }: { label: string; value: string; mono?: boolean; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-tertiary">{label}</span>
      <span className={`${mono ? 'font-mono text-[13px] tabular-nums' : 'font-[550]'} ${warning ? 'text-warning' : 'text-text-primary'}`}>{value}</span>
    </div>
  )
}
