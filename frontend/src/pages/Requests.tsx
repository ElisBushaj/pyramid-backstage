import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus, FileText, AlertTriangle } from 'lucide-react'
import { useRequests } from '@/api/hooks'
import type { EventRequest, RequestStatus } from '@/api/types/requests'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DataTable, type DataTableColumn } from '@/components/command/DataTable'

type Filter = 'ALL' | 'PROPOSED' | 'APPROVED' | 'SCHEDULED'

const ACTIVE_STATUSES: RequestStatus[] = ['DRAFT', 'PROPOSED', 'APPROVED', 'SCHEDULED']

export default function Requests() {
  const t = useT()
  const navigate = useNavigate()
  const locale = useLocaleStore((s) => s.locale)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')

  const statusParam = filter === 'ALL' ? undefined : filter
  const { data, isLoading, isError, refetch } = useRequests({
    q: search || undefined,
    status: statusParam,
  })

  const rows = data ?? []

  const subtitle = useMemo(() => {
    if (!data || data.length === 0) return t('requests.noActive')
    const active = data.filter((r) => ACTIVE_STATUSES.includes(r.status)).length
    const awaiting = data.filter((r) => r.status === 'PROPOSED').length
    return t('requests.subtitle', { active, awaiting })
  }, [data, t])

  const columns: DataTableColumn<EventRequest>[] = [
    {
      key: 'id',
      header: t('requests.idHeader'),
      width: '160px',
      sortable: true,
      render: (r) => (
        <span className="truncate font-mono text-[13px] text-accent">{r.id}</span>
      ),
    },
    {
      key: 'organizer',
      header: t('requests.organizer'),
      width: 'minmax(0,1fr)',
      render: (r) => (
        <span className="truncate font-[500] text-text-primary">{r.title}</span>
      ),
    },
    {
      key: 'attendees',
      header: t('requests.attendees'),
      width: '100px',
      align: 'right',
      render: (r) => (
        <span className="font-mono tabular-nums">{r.expectedAttendees}</span>
      ),
    },
    {
      key: 'dates',
      header: t('requests.datesHeader'),
      width: '130px',
      render: (r) => (
        <span className="font-mono text-[13px] text-text-secondary">
          {formatDate(r.preferredDates[0]?.start, locale)}
        </span>
      ),
    },
    {
      key: 'value',
      header: t('requests.value'),
      width: '120px',
      align: 'right',
      render: () => <span className="font-mono tabular-nums text-text-disabled">—</span>,
    },
    {
      key: 'status',
      header: t('requests.statusHeader'),
      width: '120px',
      render: (r) => <StatusBadge status={r.status} />,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.pipeline'), t('nav.requests')]}
        title={t('requests.title')}
        subtitle={subtitle}
        actions={
          <Button onClick={() => navigate('/requests/new')}>
            <Plus className="size-4" strokeWidth={1.8} /> {t('requests.new')}
          </Button>
        }
        filters={
          <>
            <SegmentedControl<Filter>
              aria-label={t('requests.filterLabel')}
              value={filter}
              onChange={setFilter}
              options={[
                { label: t('ui.common.all'), value: 'ALL' },
                { label: t('status.PROPOSED'), value: 'PROPOSED' },
                { label: t('status.APPROVED'), value: 'APPROVED' },
                { label: t('status.SCHEDULED'), value: 'SCHEDULED' },
              ]}
            />
            <Input
              className="max-w-72"
              placeholder={t('requests.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </>
        }
      />

      <DataTable<EventRequest>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={isLoading}
        error={isError}
        loadingRows={5}
        onRowClick={(r) => navigate(`/requests/${r.id}`)}
        emptyConfig={{
          icon: <FileText size={18} strokeWidth={1.5} />,
          title: t('requests.emptyTitle'),
          message: t('requests.emptyBody'),
          action: t('requests.new'),
          onAction: () => navigate('/requests/new'),
        }}
        errorConfig={{
          icon: <AlertTriangle size={18} strokeWidth={1.5} />,
          title: t('requests.loadError'),
          message: t('error.timedOut'),
          action: t('ui.common.retry'),
          onAction: () => void refetch(),
        }}
      />
    </div>
  )
}
