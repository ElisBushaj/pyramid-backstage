import { Link, useParams } from 'react-router'
import { ArrowLeft, CalendarDays, Users, Mail, User } from 'lucide-react'
import { useRequest } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { cn } from '@/lib/cn'
import { formatDateRange } from '@/lib/format'
import { formatMinor } from '@/lib/money'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Feedback'

// Mirrors the partner lifecycle on the list — DRAFT → PROPOSED → APPROVED → SCHEDULED.
const STAGES = ['DRAFT', 'PROPOSED', 'APPROVED', 'SCHEDULED'] as const

export default function PortalRequestDetail() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, isError, refetch } = useRequest(id)

  const backLink = (
    <Link to="/portal" className="inline-flex items-center gap-1.5 text-[13px] font-[500] text-text-secondary hover:text-text-primary">
      <ArrowLeft className="size-4" /> {t('portal.backToRequests')}
    </Link>
  )

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <Skeleton className="h-[260px] w-full rounded-lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <ErrorState title={t('error.generic')} message={t('error.generic')} onRetry={() => refetch()} retryLabel={t('ui.common.retry')} />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        <EmptyState title={t('portal.notFoundTitle')} message={t('portal.notFoundBody')} />
      </div>
    )
  }

  const { request, quote } = data
  const rejected = request.status === 'REJECTED'
  const currentIdx = request.status === 'COMPLETED' ? STAGES.length - 1 : STAGES.indexOf(request.status as (typeof STAGES)[number])
  const dates = request.preferredDates ?? []

  return (
    <div className="flex flex-col gap-6">
      {backLink}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-[650] text-text-primary">{request.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-tertiary">
            <span className="capitalize">{t(`eventType.${request.eventType}`)}</span>
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {/* Status stepper */}
      <div className="rounded-lg border border-border-subtle p-5">
        {rejected ? (
          <p className="rounded-md border border-[rgba(200,55,45,0.28)] bg-danger-subtle px-3.5 py-2.5 text-[13px] text-danger">
            {t('portal.rejected')}{request.rejectionReason ? ` — ${request.rejectionReason}` : ''}
          </p>
        ) : (
          <ol className="flex items-center gap-1.5">
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
      </div>

      {/* Details */}
      <div className="rounded-lg border border-border-subtle p-5">
        <h2 className="text-[13px] font-[650] uppercase tracking-wide text-text-tertiary">{t('portal.detailsHeading')}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailRow icon={<User className="size-3.5" />} label={t('portal.fOrganizer')} value={request.organizerName} />
          {request.contactEmail && <DetailRow icon={<Mail className="size-3.5" />} label={t('portal.fEmail')} value={request.contactEmail} />}
          <DetailRow icon={<Users className="size-3.5" />} label={t('portal.fAttendees')} value={String(request.expectedAttendees)} />
        </dl>

        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-[12px] font-[600] text-text-tertiary"><CalendarDays className="size-3.5" /> {t('portal.preferredDates')}</p>
          {dates.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {dates.map((d, i) => (
                <li key={i} className="text-[13px] text-text-primary">{formatDateRange(d.start, d.end, locale)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-text-tertiary">—</p>
          )}
        </div>
      </div>

      {/* Quote total (only once a proposal exists) */}
      {quote && (
        <div className="flex items-center justify-between rounded-lg border border-border-subtle p-5">
          <div>
            <p className="text-[13px] font-[600] text-text-primary">{t('portal.quoteTotal')}</p>
            <p className="mt-0.5 text-[12px] text-text-tertiary">{t('portal.quoteTotalSub')}</p>
          </div>
          <span className="text-[18px] font-[650] tabular-nums text-text-primary">{formatMinor(quote.totalMinor, locale)}</span>
        </div>
      )}
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-[12px] text-text-tertiary">{icon} {label}</dt>
      <dd className="text-[13px] text-text-primary">{value}</dd>
    </div>
  )
}
