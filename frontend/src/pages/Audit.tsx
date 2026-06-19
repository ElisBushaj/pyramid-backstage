import { useState } from 'react'
import { Clock, ListFilter } from 'lucide-react'
import { useAudit } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AuditTimeline } from '@/components/command/AuditTimeline'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'

export default function Audit() {
  const t = useT()
  const [requestId, setRequestId] = useState('')
  const [entityType, setEntityType] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { data, isLoading, isError, refetch } = useAudit({
    requestId: requestId || undefined,
    entityType: entityType || undefined,
  })

  const filtered = !!requestId || !!entityType
  const entries = data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.record'), t('nav.audit')]}
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <ListFilter className="size-3.5" strokeWidth={2} aria-hidden />
            {t('audit.filter')}
          </Button>
        }
        filters={
          filtersOpen ? (
            <>
              <Input
                className="w-72"
                prefix="#"
                placeholder={t('audit.filterRequest')}
                value={requestId}
                onChange={(e) => setRequestId(e.target.value)}
              />
              <Input
                className="w-48"
                placeholder={t('audit.filterEntity')}
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
              />
            </>
          ) : undefined
        }
      />

      <div className="max-w-[680px]">
        {isError ? (
          <ErrorState
            title={t('audit.errorTitle')}
            message={t('audit.errorBody')}
            action={{ label: t('ui.common.retry'), onClick: () => void refetch() }}
          />
        ) : isLoading ? (
          <AuditTimelineSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={Clock}
            title={filtered ? t('audit.emptyFilter') : t('audit.emptyTitle')}
            message={filtered ? t('audit.emptyFilterBody') : t('audit.emptyBody')}
          />
        ) : (
          <AuditTimeline entries={entries} />
        )}
      </div>
    </div>
  )
}

function AuditTimelineSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3.5 pb-[22px]">
          <div className="skeleton size-7 shrink-0 rounded-pill" aria-hidden />
          <div className="flex flex-1 flex-col gap-2 pt-0.5">
            <div className="skeleton h-3.5 w-3/5 rounded-sm" aria-hidden />
            <div className="skeleton h-3 w-2/5 rounded-sm" aria-hidden />
          </div>
        </div>
      ))}
    </div>
  )
}
