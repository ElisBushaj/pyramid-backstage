import { useMemo, useState } from 'react'
import { AlertTriangle, Boxes, CalendarDays } from 'lucide-react'
import { useAssets } from '@/api/hooks'
import type { AssetWithAvailability } from '@/api/types/assets'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { InventoryMeter, type InventoryState } from '@/components/command/InventoryMeter'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'

const TYPES = ['SEATING', 'TABLE', 'MICROPHONE', 'SCREEN', 'PROJECTOR', 'STAGE_UNIT', 'LIGHTING', 'OTHER']

interface Row {
  id: string
  name: string
  location: string
  available: number
  held: number
  total: number
  state: InventoryState
}

function toRow(a: AssetWithAvailability): Row {
  const total = a.totalQuantity ?? 0
  const available = a.availableQuantity ?? total
  const held = Math.max(0, total - available)
  const state: InventoryState =
    total > 0 && available <= 0 ? 'danger' : total > 0 && available <= total * 0.1 ? 'low' : 'ok'
  return { id: a.id, name: a.name || '—', location: a.location || '—', available, held, total, state }
}

export default function Inventory() {
  const t = useT()
  const [type, setType] = useState('')
  const [start] = useState('')
  const [end] = useState('')

  const { data, isLoading, isError, refetch } = useAssets({
    type: type || undefined,
    start: start ? new Date(start).toISOString() : undefined,
    end: end ? new Date(end).toISOString() : undefined,
  })

  const rows = useMemo(() => (data ?? []).map(toRow), [data])
  const lowRows = useMemo(() => rows.filter((r) => r.state === 'low' || r.state === 'danger'), [rows])
  const hasLow = lowRows.length > 0

  const subtitle = data
    ? hasLow
      ? t('inventory.lowCount', { count: lowRows.length })
      : t('inventory.windowSub')
    : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.resources'), t('nav.inventory')]}
        title={t('inventory.title')}
        subtitle={subtitle}
        actions={
          <Button variant="secondary" size="sm">
            <CalendarDays className="size-4" aria-hidden />
            {t('inventory.changeWindow')}
          </Button>
        }
        filters={
          <>
            <Select className="w-44" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('ui.common.all')}</option>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {hasLow && !isLoading && !isError ? (
        <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-subtle px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-[13px] leading-5 text-warning">
            {t('inventory.lowBanner', { names: lowRows.map((r) => r.name).join(', ') })}
          </p>
        </div>
      ) : null}

      {isLoading ? (
        <InventorySkeleton />
      ) : isError ? (
        <ErrorState
          title={t('inventory.loadError')}
          message={t('error.timedOut')}
          onRetry={() => refetch()}
          retryLabel={t('ui.common.retry')}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={Boxes} title={t('inventory.emptyTitle')} message={t('inventory.emptyBody')} />
      ) : (
        <div className="overflow-hidden rounded-md border border-border-subtle">
          <div className="grid grid-cols-[200px_1fr_150px] gap-5 border-b border-border-subtle bg-surface-subtle px-5 py-3 text-[11px] font-[500] uppercase tracking-[0.04em] text-text-tertiary">
            <span>{t('inventory.colAsset')}</span>
            <span>{t('inventory.colAvailability')}</span>
            <span className="text-right">{t('inventory.colInWindow')}</span>
          </div>
          {rows.map((r) => (
            <InventoryMeter
              key={r.id}
              name={r.name}
              location={r.location}
              available={r.available}
              held={r.held}
              total={r.total}
              state={r.state}
              className="px-5 last:border-b-0"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InventorySkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[200px_1fr_150px] items-center gap-5 border-b border-border-subtle px-5 py-[18px] last:border-b-0"
        >
          <Skeleton className="h-3.5 w-[70%]" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="ml-auto h-3.5 w-[60%]" />
        </div>
      ))}
    </div>
  )
}
