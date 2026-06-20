import { useNavigate } from 'react-router'
import { AlertTriangle, Plus } from 'lucide-react'
import {
  useAudit,
  useConflicts,
  useDashboardStats,
  useRequests,
  useSpaces,
} from '@/api/hooks'
import type { Conflict } from '@/api/types/_envelope'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { KPIStat } from '@/components/command/KPIStat'
import { AssetLocationBoard } from '@/components/command/AssetLocationBoard'
import { FloorMapPanel, deriveFloorStatuses } from '@/components/command/FloorMap'
import { AvailabilityTimeline } from '@/components/command/AvailabilityTimeline'
import { AuditTimeline } from '@/components/command/AuditTimeline'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'

/** "Tuesday, 22 July 2026" in the active locale (no clipping in AL). */
function formatToday(locale: 'al' | 'en'): string {
  const intl = locale === 'al' ? 'sq-AL' : 'en-GB'
  return new Intl.DateTimeFormat(intl, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

export default function Dashboard() {
  const t = useT()
  const navigate = useNavigate()
  const locale = useLocaleStore((s) => s.locale)

  const { data: stats, isLoading, isError, refetch } = useDashboardStats()
  const { data: requests } = useRequests({ pageSize: 6 })
  const { data: conflicts } = useConflicts({})
  const { data: audit } = useAudit({ pageSize: 8 })
  const { data: spaces } = useSpaces({})
  // F19 — light any clashing spaces red on the venue map (the digital twin at a glance).
  const floorStatuses = deriveFloorStatuses(spaces ?? [], {
    conflictSpaceIds: (conflicts ?? []).map((c) => c.spaceId).filter((x): x is string => !!x),
  })

  const today = formatToday(locale)
  const subtitle =
    stats != null
      ? `${today} · ${t('dashboard.spacesInUseSub', {
          count: stats.spacesInUse.inUse,
        })}`
      : today

  const newRequestAction = (
    <Button onClick={() => navigate('/requests/new')}>
      <Plus className="size-4" /> {t('requests.new')}
    </Button>
  )

  // ── error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('dashboard.title')} actions={newRequestAction} />
        <ErrorState
          title={t('dashboard.loadErrorTitle')}
          message={t('dashboard.loadErrorBody')}
          action={{ label: t('ui.common.retry'), onClick: () => refetch() }}
        />
      </div>
    )
  }

  // ── loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-[200px]" />
          <Skeleton className="h-3.5 w-[280px]" />
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised"
            >
              <Skeleton className="h-3 w-3/5" />
              <Skeleton className="h-7 w-2/5" />
            </div>
          ))}
        </div>
        <Card>
          <CardBody className="flex flex-col gap-3.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 w-full" />
            ))}
          </CardBody>
        </Card>
      </div>
    )
  }

  // ── empty (no events scheduled) ───────────────────────────────────────────
  const noEvents = requests != null && requests.length === 0
  if (noEvents) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          title={t('dashboard.title')}
          subtitle={today}
          actions={newRequestAction}
        />
        <EmptyState
          title={t('dashboard.emptyTitle')}
          message={t('dashboard.emptyBody')}
          action={
            <Button onClick={() => navigate('/requests/new')}>
              <Plus className="size-[13px]" /> {t('requests.new')}
            </Button>
          }
        />
      </div>
    )
  }

  // ── default ────────────────────────────────────────────────────────────────
  const s = stats
  const conflictList = conflicts ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={subtitle}
        actions={newRequestAction}
      />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KPIStat
          label={t('dashboard.eventsThisWeek')}
          value={s?.eventsThisWeek.value ?? 0}
          trend={s?.eventsThisWeek.delta ? Math.abs(s.eventsThisWeek.delta) : undefined}
          trendUp={(s?.eventsThisWeek.delta ?? 0) >= 0}
          sub={s?.eventsThisWeek.hint ?? t('dashboard.eventsSub')}
        />
        <KPIStat
          label={t('dashboard.spacesInUse')}
          value={s ? `${s.spacesInUse.inUse} / ${s.spacesInUse.total}` : '—'}
          sub={t('dashboard.now')}
        />
        <KPIStat
          label={t('dashboard.lowStock')}
          value={s?.lowStockAssets.value ?? 0}
          alert={(s?.lowStockAssets.value ?? 0) > 0}
          sub={s?.lowStockAssets.hint}
        />
        <KPIStat
          label={t('dashboard.pendingApprovals')}
          value={s?.pendingApprovals.value ?? 0}
          trend={
            s?.pendingApprovals.delta ? Math.abs(s.pendingApprovals.delta) : undefined
          }
          trendUp={(s?.pendingApprovals.delta ?? 0) >= 0}
          sub={s?.pendingApprovals.hint ?? t('dashboard.awaitingManager')}
        />
      </div>

      {conflictList.length > 0 ? (
        <DashboardConflictAlert
          count={conflictList.length}
          conflict={conflictList[0]}
          onResolve={() => navigate('/conflicts')}
        />
      ) : null}

      <section>
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="text-[13px] font-[600] text-text-secondary">
            {t('dashboard.liveSchedule')}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-[600] text-success">
            <span
              className="size-1.5 rounded-pill bg-success"
              style={{ animation: 'pulse-dot 1.8s ease-in-out infinite' }}
              aria-hidden
            />
            {t('dashboard.live')}
          </span>
        </div>
        <AvailabilityTimeline />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <FloorMapPanel spaces={floorStatuses} title={t('floorMap.venueTitle')} />
        <AssetLocationBoard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
        </CardHeader>
        <CardBody>
          <AuditTimeline entries={audit ?? []} />
        </CardBody>
      </Card>
    </div>
  )
}

/**
 * Compact dashboard conflict alert (§3.1) — a single danger-tinted summary line
 * with a count, the first conflict's detail, and a danger "Resolve" jump to the
 * Conflicts board. The heavyweight per-conflict explainer lives on /conflicts.
 */
function DashboardConflictAlert({
  count,
  conflict,
  onResolve,
}: {
  count: number
  conflict: Conflict
  onResolve: () => void
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-[rgba(200,55,45,0.28)] bg-danger-subtle px-4 py-3.5">
      <AlertTriangle
        className="size-[18px] shrink-0 text-danger"
        strokeWidth={1.8}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-[600] text-danger">
          {t('dashboard.activeConflicts', { count })}
        </p>
        <p className="truncate text-[13px] text-[#7A2A23]">{conflict.detail}</p>
      </div>
      <Button variant="danger" size="sm" onClick={onResolve}>
        {t('dashboard.resolve')}
      </Button>
    </div>
  )
}
