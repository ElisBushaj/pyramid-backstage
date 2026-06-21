import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { useSpaces } from '@/api/hooks'
import type { SpaceWithAvailability } from '@/api/types/spaces'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatMinor } from '@/lib/money'
import { PageHeader } from '@/components/ui/PageHeader'
import { SpaceCard } from '@/components/command/SpaceCard'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'

const LAYOUTS = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION', 'CABARET', 'BOARDROOM']

/** Pick the capacity for the active layout filter, else the largest layout figure. */
function capacityFor(space: SpaceWithAvailability, layout: string): number {
  const caps = space.capacities ?? {}
  if (layout && caps[layout] != null) return caps[layout]
  const values = Object.values(caps)
  return values.length ? Math.max(...values) : 0
}

export default function Spaces() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const navigate = useNavigate()
  const [layout, setLayout] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const { data, isLoading, isError, refetch } = useSpaces({
    layout: layout || undefined,
    minCapacity: minCapacity || undefined,
    start: start ? new Date(start).toISOString() : undefined,
    end: end ? new Date(end).toISOString() : undefined,
  })

  const hasFilters = !!(layout || minCapacity || start || end)
  const total = data?.length ?? 0

  const subtitle = useMemo(() => {
    if (hasFilters) return t('spaces.matchCount', { count: total })
    return t('spaces.count', { count: total })
  }, [hasFilters, total, t])

  const clearFilters = () => {
    setLayout('')
    setMinCapacity('')
    setStart('')
    setEnd('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.resources'), t('nav.spaces')]}
        title={t('spaces.title')}
        subtitle={data ? subtitle : undefined}
        filters={
          <FilterRow
            layout={layout}
            setLayout={setLayout}
            minCapacity={minCapacity}
            setMinCapacity={setMinCapacity}
            start={start}
            setStart={setStart}
            end={end}
            setEnd={setEnd}
          />
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SpaceCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('spaces.loadErrorList')}
          message={t('error.timedOut')}
          onRetry={() => refetch()}
          retryLabel={t('ui.common.retry')}
        />
      ) : total === 0 ? (
        <EmptyState
          title={t('spaces.emptyTitle')}
          message={t('spaces.emptyBody')}
          action={hasFilters ? { label: t('spaces.clearFilters'), onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((s) => {
            const cap = capacityFor(s, layout)
            // The layout label is only shown when a layout filter is active (see
            // SpaceCard `layoutActive`); otherwise the card shows neutral "max capacity".
            const activeLayout = layout.toLowerCase()
            return (
              <SpaceCard
                key={s.id}
                name={s.name || '—'}
                floor={`${t('spaces.floor')} ${s.floor ?? '—'}`}
                capacity={cap}
                layout={activeLayout}
                layoutActive={!!layout}
                features={s.features ?? []}
                rate={formatMinor(s.dayRateMinor ?? 0, locale)}
                availability={s.available === false ? 'held' : 'free'}
                onSelect={() => navigate(`/spaces/${s.id}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FilterRow({
  layout,
  setLayout,
  minCapacity,
  setMinCapacity,
  start,
  setStart,
  end,
  setEnd,
}: {
  layout: string
  setLayout: (v: string) => void
  minCapacity: string
  setMinCapacity: (v: string) => void
  start: string
  setStart: (v: string) => void
  end: string
  setEnd: (v: string) => void
}) {
  const t = useT()
  const pill =
    'inline-flex h-[34px] items-center gap-[7px] rounded-control border border-border-strong bg-surface px-3 text-[13px] text-text-primary'

  return (
    <>
      {/* Date window pill — start + end datetime in one labelled control */}
      <label className={pill}>
        <CalendarDays className="size-[13px] shrink-0 text-text-tertiary" aria-hidden />
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label={t('field.preferredStart')}
          className="bg-transparent text-[13px] text-text-primary outline-none [color-scheme:light]"
        />
        <span aria-hidden className="text-text-tertiary">
          –
        </span>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label={t('field.preferredEnd')}
          className="bg-transparent text-[13px] text-text-primary outline-none [color-scheme:light]"
        />
      </label>

      {/* Min capacity pill */}
      <label className={pill}>
        <span className="text-text-secondary">{t('spaces.minCapacity')}</span>
        <input
          type="number"
          min={1}
          value={minCapacity}
          onChange={(e) => setMinCapacity(e.target.value)}
          placeholder="—"
          className="w-14 bg-transparent font-mono text-[13px] font-[600] tabular-nums text-text-primary outline-none placeholder:font-sans placeholder:font-normal placeholder:text-text-tertiary"
        />
      </label>

      {/* Layout pill — native select styled inline */}
      <label className={pill}>
        <span className="text-text-secondary">{t('field.layout')}</span>
        <div className="relative inline-flex items-center">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            aria-label={t('field.layout')}
            className="appearance-none bg-transparent pr-4 text-[13px] font-[550] text-text-primary outline-none"
          >
            <option value="">{t('ui.common.all')}</option>
            {LAYOUTS.map((l) => (
              <option key={l} value={l}>
                {l.charAt(0) + l.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 size-3 text-text-tertiary" aria-hidden />
        </div>
      </label>
    </>
  )
}

function SpaceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-border-subtle bg-surface p-[18px]">
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-7 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-[70%]" />
    </div>
  )
}
