import { Link } from 'react-router'
import { Plus, CalendarDays, Users } from 'lucide-react'
import { useRequests } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Feedback'
import type { EventRequest } from '@/api/types/requests'

// The partner's lifecycle is a one-way path; show where each request sits.
const STAGES = ['DRAFT', 'PROPOSED', 'APPROVED', 'SCHEDULED'] as const

export default function PortalRequests() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { data: requests, isLoading, isError, refetch } = useRequests({ pageSize: 50 })
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale === 'al' ? 'sq-AL' : 'en-GB', { dateStyle: 'medium' }).format(new Date(iso))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-[650] text-text-primary">{t('portal.myRequests')}</h1>
          <p className="mt-1 text-[13px] text-text-tertiary">{t('portal.myRequestsSub')}</p>
        </div>
        <Button asChild size="sm"><Link to="/portal/new"><Plus className="size-4" /> {t('portal.newRequest')}</Link></Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-[120px] w-full rounded-lg" />)}</div>
      ) : isError ? (
        <ErrorState title={t('error.generic')} message={t('error.generic')} onRetry={() => refetch()} retryLabel={t('ui.common.retry')} />
      ) : !requests || requests.length === 0 ? (
        <EmptyState title={t('portal.emptyTitle')} message={t('portal.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3.5">
          {requests.map((r) => <RequestCard key={r.id} r={r} t={t} fmtDate={fmtDate} />)}
        </ul>
      )}
    </div>
  )
}

function RequestCard({ r, t, fmtDate }: { r: EventRequest; t: ReturnType<typeof useT>; fmtDate: (iso: string) => string }) {
  const rejected = r.status === 'REJECTED'
  // COMPLETED is past the last visible stage — clamp so the stepper fills instead of blanking.
  const currentIdx = r.status === 'COMPLETED' ? STAGES.length - 1 : STAGES.indexOf(r.status as (typeof STAGES)[number])
  const dates = r.preferredDates ?? []

  return (
    <li className="rounded-lg border border-border-subtle p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-[600] text-text-primary">{r.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-tertiary">
            <span className="capitalize">{t(`eventType.${r.eventType}`)}</span>
            <span className="flex items-center gap-1"><Users className="size-3" /> {r.expectedAttendees}</span>
            {dates.length > 0 && (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" />
                {dates.map((d) => fmtDate(d.start)).join(', ')}
              </span>
            )}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {/* Status stepper */}
      {rejected ? (
        <p className="mt-4 rounded-md border border-[rgba(200,55,45,0.28)] bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
          {t('portal.rejected')}{r.rejectionReason ? ` — ${r.rejectionReason}` : ''}
        </p>
      ) : (
        <ol className="mt-4 flex items-center gap-1.5">
          {STAGES.map((stage, i) => (
            <li key={stage} className="flex flex-1 items-center gap-1.5">
              <div className="flex flex-col items-center gap-1">
                <span className={cn('size-2.5 rounded-full', i <= currentIdx ? 'bg-accent' : 'bg-border-subtle')} />
                <span className={cn('text-[10px] font-[600] uppercase tracking-wide', i <= currentIdx ? 'text-accent' : 'text-text-tertiary')}>{t(`status.${stage}`)}</span>
              </div>
              {i < STAGES.length - 1 && <span className={cn('h-px flex-1', i < currentIdx ? 'bg-accent' : 'bg-border-subtle')} />}
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}
