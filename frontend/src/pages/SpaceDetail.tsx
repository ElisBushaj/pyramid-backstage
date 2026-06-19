import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { Pencil } from 'lucide-react'
import { useSpaces, useMe, useUpdateSpace } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatMinor } from '@/lib/money'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Feedback'
import { ErrorState } from '@/components/ui/Feedback'
import { AvailabilityTimeline } from '@/components/command/AvailabilityTimeline'
import type { SpaceInput } from '@/api/types/spaces'

const LAYOUT_ORDER = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION', 'CABARET', 'BOARDROOM', 'CUSTOM']

export default function SpaceDetail() {
  const { id } = useParams()
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const spacesQuery = useSpaces({})
  const me = useMe().data
  const space = spacesQuery.data?.find((s) => s.id === id)
  const update = useUpdateSpace(id ?? '')

  const canEdit = me ? ['OPS', 'MANAGER', 'ADMIN'].includes(me.role) : false
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<SpaceInput>>({})

  const caps = useMemo(() => ({ ...(space?.capacities ?? {}), ...(draft.capacities ?? {}) }), [space, draft])

  if (spacesQuery.isLoading) {
    return (
      <div>
        <Skeleton className="h-7 w-[220px]" />
        <div className="mt-6 flex flex-wrap gap-5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-1 flex-col gap-3.5 rounded-lg border border-border-subtle p-5">
              <Skeleton className="h-[18px] w-1/2" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-[70%]" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (spacesQuery.isError || !space) {
    return <ErrorState title={t('spaces.loadError')} message={t('error.generic')} action={<Button variant="secondary" size="sm" onClick={() => spacesQuery.refetch()}>{t('ui.common.retry')}</Button>} />
  }

  const layouts = LAYOUT_ORDER.filter((l) => l in caps).map((l) => [l, caps[l]] as const)

  function saveEdit() {
    update.mutate({ capacities: caps as Record<string, number>, ...draft }, { onSuccess: () => setEditing(false) })
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[t('nav.resources'), t('nav.spaces'), space.name]}
        title={space.name}
        subtitle={editing ? `${t('spaces.editMode')} · ${me?.role}` : `${t('spaces.floor')} ${space.floor}`}
        actions={
          editing ? (
            <div className="flex items-center gap-2.5">
              <span className="rounded-pill bg-accent-muted px-2.5 py-1 text-[11px] font-[600] uppercase text-accent">{t('spaces.editMode')}</span>
              <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setDraft({}) }}>{t('ui.common.cancel')}</Button>
              <Button size="sm" loading={update.isPending} onClick={saveEdit}>{t('spaces.save')}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {space.available !== false && (
                <span className="inline-flex items-center gap-1.5 text-[13px] font-[600] text-success">
                  <span className="size-2 rounded-pill bg-success" /> {t('spaces.availableNow')}
                </span>
              )}
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="size-3.5" /> {t('spaces.edit')}
                </Button>
              )}
            </div>
          )
        }
      />

      <div className="mt-6 flex flex-wrap gap-5">
        {/* Capacity per layout */}
        <section className="min-w-[300px] flex-1 rounded-lg border border-border-subtle p-5">
          <h2 className="mb-3.5 text-[15px] font-[600] text-text-primary">{t('spaces.capacityPerLayout')}</h2>
          {layouts.map(([layout, value]) => (
            <div key={layout} className="flex items-center justify-between border-b border-border-subtle py-[11px] last:border-0">
              <span className="text-[14px] capitalize text-text-secondary">{layout.toLowerCase()}</span>
              {editing ? (
                <input
                  type="number"
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, capacities: { ...caps, [layout]: Number(e.target.value) } as Record<string, number> }))}
                  className="h-8 w-[90px] rounded-[7px] border border-border-focus bg-[#F7F9FE] px-2.5 text-right font-mono text-[14px] font-[600] tabular-nums outline-none"
                />
              ) : (
                <span className="font-mono text-[14px] font-[600] tabular-nums text-text-primary">
                  {value} <span className="font-sans text-[12px] font-normal text-text-tertiary">{t('spaces.pax')}</span>
                </span>
              )}
            </div>
          ))}
        </section>

        {/* Details */}
        <section className="min-w-[300px] flex-1 rounded-lg border border-border-subtle p-5">
          <h2 className="mb-3.5 text-[15px] font-[600] text-text-primary">{t('spaces.details')}</h2>
          <DetailRow label={t('spaces.dayRate')} value={`${formatMinor(space.dayRateMinor, locale)} ${space.currency}`} />
          <DetailRow label={t('spaces.setupBuffer')} value={`${space.setupBufferMinutes} ${t('spaces.minutes')}`} />
          <DetailRow label={t('spaces.teardownBuffer')} value={`${space.teardownBufferMinutes} ${t('spaces.minutes')}`} />
          <div className="pt-3.5">
            <p className="mb-2 text-[13px] text-text-secondary">{t('spaces.features')}</p>
            <div className="flex flex-wrap gap-1.5">
              {space.features.map((f) => (
                <span key={f} className="rounded-pill bg-surface-sunken px-[9px] py-[3px] text-[12px] text-text-secondary">{f}</span>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Today's schedule */}
      <section className="mt-5 rounded-lg border border-border-subtle px-5 pb-4 pt-6">
        <h2 className="mb-6 text-[15px] font-[600] text-text-primary">{t('spaces.todaySchedule')}</h2>
        <AvailabilityTimeline lanes={[{ id: space.id, name: space.name, cap: caps['THEATER'] ?? 0, reservations: [] }]} />
      </section>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-[11px] last:border-0">
      <span className="text-[14px] text-text-secondary">{label}</span>
      <span className={cn('font-mono text-[14px] font-[600] tabular-nums text-text-primary')}>{value}</span>
    </div>
  )
}
