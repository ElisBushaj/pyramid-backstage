import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { ShieldCheck } from 'lucide-react'
import { useConflicts } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConflictBanner } from '@/components/command/ConflictBanner'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'

function defaultWindow() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 60)
  const end = new Date(now)
  end.setDate(end.getDate() + 60)
  return { start: start.toISOString(), end: end.toISOString() }
}

export default function Conflicts() {
  const t = useT()
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch } = useConflicts(defaultWindow())
  const conflicts = data ?? []

  const subtitle = useMemo(() => {
    if (isLoading || isError) return undefined
    const n = conflicts.length
    return n === 0 ? t('conflicts.allClear') : t('conflicts.subtitle', { count: n })
  }, [conflicts.length, isLoading, isError, t])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.operations'), t('nav.conflicts')]}
        title={t('nav.conflicts')}
        subtitle={subtitle}
      />

      {isLoading ? (
        <div className="flex flex-col gap-5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border-subtle bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-[26px] rounded-[7px]" />
                <Skeleton className="h-4 w-48 rounded-sm" />
              </div>
              <Skeleton className="mt-3.5 h-3 w-[80%] rounded-sm" />
              <Skeleton className="mt-2 h-3 w-[55%] rounded-sm" />
              <div className="mt-[18px] flex gap-2.5">
                <Skeleton className="h-9 w-36 rounded-control" />
                <Skeleton className="h-9 w-28 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('conflicts.loadError')}
          message={t('error.timedOut')}
          action={{ label: t('ui.common.retry'), onClick: () => void refetch() }}
        />
      ) : conflicts.length > 0 ? (
        <ConflictBanner conflicts={conflicts} />
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title={t('conflicts.emptyTitle')}
          message={t('conflicts.emptyBody')}
          action={{ label: t('conflicts.viewCalendar'), onClick: () => navigate('/calendar') }}
        />
      )}
    </div>
  )
}
