import { useEffect, useState } from 'react'
import { Clock, ListFilter } from 'lucide-react'
import { useAudit } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AuditTimeline } from '@/components/command/AuditTimeline'
import { Pager } from '@/components/command/Pager'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'

// Known audit entity types — raw names double as option labels (no per-type i18n).
const ENTITY_TYPES = ['EventRequest', 'Reservation', 'Asset', 'Quote', 'Task', 'Space', 'User'] as const
const ALL_ENTITY_TYPES = '__all__'

export default function Audit() {
  const t = useT()
  const [requestId, setRequestId] = useState('')
  const [entityType, setEntityType] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const debouncedRequestId = useDebouncedValue(requestId, 300)
  const { data, isLoading, isError, refetch } = useAudit({
    requestId: debouncedRequestId || undefined,
    entityType: entityType || undefined,
    page,
    pageSize: 50,
    order: 'desc',
  })

  // A narrowed filter can leave us on a now-empty page — snap back to 1.
  useEffect(() => {
    setPage(1)
  }, [debouncedRequestId, entityType])

  // Clamp into range if the ledger shrinks under us.
  useEffect(() => {
    if (data && page > data.totalPages) setPage(data.totalPages)
  }, [data, page])

  const filtered = !!debouncedRequestId || !!entityType
  const entries = data?.data ?? []

  const entityOptions = [
    { value: ALL_ENTITY_TYPES, label: t('audit.entityTypeAll') },
    ...ENTITY_TYPES.map((e) => ({ value: e, label: e })),
  ]

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
              <Select
                aria-label={t('audit.filterEntity')}
                placeholder={t('audit.filterEntity')}
                triggerClassName="w-48"
                value={entityType || ALL_ENTITY_TYPES}
                onValueChange={(v) => setEntityType(v === ALL_ENTITY_TYPES ? '' : v)}
                options={entityOptions}
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
          <>
            <AuditTimeline entries={entries} />
            {data && (
              <Pager
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                totalPages={data.totalPages}
                onPageChange={setPage}
              />
            )}
          </>
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
