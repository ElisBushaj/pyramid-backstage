import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useDashboardStats, useRequests } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { KPIStat } from '@/components/command/KPIStat'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/Feedback'

export default function Dashboard() {
  const t = useT()
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()
  const { data: requests } = useRequests({ pageSize: 6 })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboard.title')}
        actions={<Button onClick={() => navigate('/requests/new')}><Plus className="size-4" /> {t('requests.new')}</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPIStat label={t('dashboard.eventsThisWeek')} value={stats?.eventsThisWeek.value} delta={stats?.eventsThisWeek.delta} loading={isLoading} />
        <KPIStat label={t('dashboard.spacesInUse')} value={stats ? `${stats.spacesInUse.inUse}/${stats.spacesInUse.total}` : undefined} loading={isLoading} />
        <KPIStat label={t('dashboard.lowStock')} value={stats?.lowStockAssets.value} loading={isLoading} />
        <KPIStat label={t('dashboard.pendingApprovals')} value={stats?.pendingApprovals.value} loading={isLoading} />
      </div>

      <Card>
        <CardHeader><CardTitle>{t('dashboard.recentActivity')}</CardTitle></CardHeader>
        <CardBody className="px-0 py-0">
          {requests && requests.length === 0 ? (
            <div className="p-5"><EmptyState title={t('dashboard.noEvents')} action={t('requests.new')} onAction={() => navigate('/requests/new')} /></div>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {(requests ?? []).map((r) => (
                <li key={r.id} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 hover:bg-surface-subtle" onClick={() => navigate(`/requests/${r.id}`)}>
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-[550] text-text-primary">{r.title}</p>
                    <p className="truncate text-[12px] text-text-tertiary">{r.organizerName} · {r.expectedAttendees} {t('requests.attendees').toLowerCase()}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
