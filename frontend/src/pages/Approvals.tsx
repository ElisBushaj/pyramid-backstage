import { useState } from 'react'
import { Link } from 'react-router'
import { CheckCircle2, XCircle, Users, CalendarDays, Sparkles } from 'lucide-react'
import { useRequests, useApprove, useReject } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import type { EventRequest } from '@/api/types/requests'

export default function Approvals() {
  const t = useT()
  const { data: requests, isLoading, isError, refetch } = useRequests({ status: 'PROPOSED', pageSize: 50 })

  return (
    <div>
      <PageHeader breadcrumb={[t('nav.operations'), t('nav.approvals')]} title={t('approvals.title')} subtitle={t('approvals.subtitle')} />
      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-[120px] w-full rounded-lg" />)}</div>
        ) : isError ? (
          <ErrorState title={t('error.generic')} message={t('error.generic')} onRetry={() => refetch()} retryLabel={t('ui.common.retry')} />
        ) : !requests || requests.length === 0 ? (
          <EmptyState title={t('approvals.emptyTitle')} message={t('approvals.emptyBody')} />
        ) : (
          <ul className="flex flex-col gap-3.5">
            {requests.map((r) => <ApprovalRow key={r.id} r={r} onDone={() => refetch()} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

function ApprovalRow({ r, onDone }: { r: EventRequest; onDone: () => void }) {
  const t = useT()
  const { toast } = useToast()
  const locale = useLocaleStore((s) => s.locale)
  const approve = useApprove(r.id)
  const reject = useReject(r.id)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const first = r.preferredDates?.[0]
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale === 'al' ? 'sq-AL' : 'en-GB', { dateStyle: 'medium' }).format(new Date(iso))

  function doApprove() {
    approve.mutate(undefined, {
      onSuccess: () => { toast({ tone: 'success', title: t('plan.approvedToast'), message: r.title }); onDone() },
      onError: () => toast({ tone: 'danger', title: t('error.generic') }),
    })
  }
  function doReject() {
    if (reason.trim().length < 3) return
    reject.mutate(reason.trim(), {
      onSuccess: () => { toast({ tone: 'info', title: t('plan.rejectedToast') }); setRejecting(false); onDone() },
      onError: () => toast({ tone: 'danger', title: t('error.generic') }),
    })
  }

  return (
    <li className="rounded-lg border border-border-subtle p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/requests/${r.id}`} className="text-[15px] font-[600] text-text-primary hover:text-accent">{r.title}</Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-tertiary">
            <span>{r.organizerName}</span>
            <span className="capitalize">{t(`eventType.${r.eventType}`)}</span>
            <span className="flex items-center gap-1"><Users className="size-3" /> {r.expectedAttendees}</span>
            {first && <span className="flex items-center gap-1"><CalendarDays className="size-3" /> {fmtDate(first.start)}</span>}
          </p>
        </div>
        {!rejecting && (
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}><XCircle className="size-3.5" /> {t('plan.reject')}</Button>
            <Button size="sm" loading={approve.isPending} onClick={doApprove}><CheckCircle2 className="size-3.5" /> {t('plan.approve')}</Button>
          </div>
        )}
      </div>

      {/* F18 fills this with the AI's approve/decline recommendation + reasoning. */}
      <div className="mt-3 flex items-start gap-2 rounded-md border border-dashed border-border-subtle bg-surface-subtle px-3.5 py-2.5">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
        <p className="text-[12px] text-text-tertiary">{t('approvals.aiSlot')}</p>
      </div>

      {rejecting && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('plan.rejectReasonPlaceholder')} className="min-w-[240px] flex-1" />
          <Button variant="secondary" size="sm" onClick={() => { setRejecting(false); setReason('') }}>{t('ui.common.cancel')}</Button>
          <Button variant="danger" size="sm" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={doReject}>{t('plan.reject')}</Button>
        </div>
      )}
    </li>
  )
}
