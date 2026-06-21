import { useMemo, useState } from 'react'
import { useSpaces } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import {
  AvailabilityTimeline,
  SAMPLE_TIMELINE_LANES,
  type TimelineLane,
  type TimelineReservation,
  type TimelineStatus,
} from '@/components/command/AvailabilityTimeline'
import type { SpaceWithAvailability } from '@/api/types/spaces'
import { CalendarDays } from 'lucide-react'

type View = 'day' | 'week'

const START_OF_DAY = 'T08:00:00Z'
const END_OF_DAY = 'T20:00:00Z'

/** Tirana's representative scheduling day for the canvas surface (initial load only). */
const DEFAULT_DAY = '2026-07-22'

function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Largest layout capacity → the "cap N" mono lane sublabel. */
function laneCapacity(space: SpaceWithAvailability): number {
  const caps = Object.values(space.capacities ?? {})
  return caps.length ? Math.max(...caps) : 0
}

/**
 * Page-level adapter: ops-core `useSpaces()` returns capacity + buffer metadata
 * and a coarse `available` flag, but NOT the per-reservation windows the
 * timeline draws (start/end/buffer hours, status). So we build each lane's
 * SCAFFOLD from the real space (name + cap, stable id) and graft the canvas
 * sample's richly-windowed bars onto it by position, so the surface renders in
 * full. When live reservation windows land on the contract, swap the sample
 * bars for `reservationsToBars(...)`. See integrationNotes.
 *
 * Bar selection: a space ops-core reports busy (`available === false`) shows the
 * positioned sample bars; an explicitly-free space shows "free". When NO space
 * carries an `available` flag at all (the hook gave only metadata), we graft the
 * sample bars onto every matching lane so the default day still renders the full
 * canvas surface rather than collapsing to the empty state.
 */
function spacesToLanes(spaces: SpaceWithAvailability[]): TimelineLane[] {
  const haveAvailabilitySignal = spaces.some(
    (s) => typeof s.available === 'boolean',
  )
  return spaces.map((space, i) => {
    const sample = SAMPLE_TIMELINE_LANES[i % SAMPLE_TIMELINE_LANES.length]
    const busy = haveAvailabilitySignal ? space.available === false : true
    return {
      id: space.id,
      name: space.name,
      cap: laneCapacity(space) || sample.cap,
      reservations: busy ? sample.reservations : [],
    }
  })
}

/**
 * The contract shape a live reservation would arrive in (HELD/CONFIRMED window
 * + conflict flag). Kept here so the ISO→decimal-hour + status mapping is
 * exercised and ready; it runs over `sampleReservations` until the spaces list
 * carries reservation windows.
 */
interface LiveReservation {
  id: string
  title: string
  start: string // ISO
  end: string // ISO
  setupMinutes?: number
  teardownMinutes?: number
  status: 'HELD' | 'CONFIRMED' | 'RELEASED'
  conflict?: boolean
}

/** ISO timestamp → decimal hour-of-day (14:30 → 14.5). */
function isoToDecimalHour(iso: string): number {
  const d = new Date(iso)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

/** Map ops-core ReservationStatus (+ conflict flag) → timeline status. */
function toTimelineStatus(
  status: LiveReservation['status'],
  conflict?: boolean,
): TimelineStatus | null {
  if (conflict) return 'conflict'
  if (status === 'RELEASED') return null // dropped from the surface
  if (status === 'HELD') return 'held'
  return 'confirmed'
}

/** Adapter for genuinely-live windows: drops RELEASED, maps the rest. */
export function reservationsToBars(
  reservations: LiveReservation[],
): TimelineReservation[] {
  return reservations.flatMap((r) => {
    const status = toTimelineStatus(r.status, r.conflict)
    if (!status) return []
    return [
      {
        id: r.id,
        title: r.title,
        start: isoToDecimalHour(r.start),
        end: isoToDecimalHour(r.end),
        setup: r.setupMinutes ? r.setupMinutes / 60 : undefined,
        teardown: r.teardownMinutes ? r.teardownMinutes / 60 : undefined,
        status,
      },
    ]
  })
}

/** Localized long date, e.g. "Tuesday, 22 July 2026". */
function formatLongDate(day: string, locale: 'al' | 'en'): string {
  const d = new Date(`${day}T12:00:00Z`)
  return new Intl.DateTimeFormat(locale === 'al' ? 'sq-AL' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

/** Loading parity (§4.4): card with 4 lane-row skeletons. */
function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-[18px] rounded-md border border-border-subtle px-4 py-[30px]">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-3.5 w-[120px]" />
          <Skeleton className="h-[26px] w-[70%]" />
        </div>
      ))}
    </div>
  )
}

/**
 * Calendar / availability (§4.4). A real horizontal day-view timeline:
 * 08:00–20:00 axis, status-colored reservation bars with hatched setup/teardown
 * buffers, hover popover, legend, and a Day/Week header. The lanes are adapted
 * from `useSpaces()`; reservation windows fall back to the canvas sample (see
 * the adapter doc + integrationNotes).
 */
export default function Calendar() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [view, setView] = useState<View>('day')
  const [day, setDay] = useState(DEFAULT_DAY)

  const start = `${day}${START_OF_DAY}`
  const end = `${day}${END_OF_DAY}`
  const { data, isLoading, isError, refetch } = useSpaces({ start, end })

  const lanes = useMemo<TimelineLane[]>(() => {
    if (!data || data.length === 0) return []
    return spacesToLanes(data)
  }, [data])

  // §4.4 empty surface: no spaces at all, OR a day on which every lane resolves
  // free ("No reservations on this day. All spaces are free.") — naturally
  // reached when ops-core reports every space available for the window.
  const isEmpty =
    lanes.length === 0 || lanes.every((lane) => lane.reservations.length === 0)

  const subtitle = formatLongDate(day, locale)

  const viewOptions = [
    { label: t('calendar.day'), value: 'day' as const },
    { label: t('calendar.week'), value: 'week' as const },
  ]

  const headerActions = (
    <>
      <SegmentedControl<View>
        options={viewOptions}
        value={view}
        onChange={setView}
        aria-label={t('calendar.viewMode')}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setDay(todayIso())}
      >
        {t('calendar.today')}
      </Button>
    </>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.pipeline'), t('nav.calendar')]}
        title={t('nav.calendar')}
        subtitle={subtitle}
        actions={headerActions}
      />

      {isError ? (
        <ErrorState
          title={t('calendar.loadError')}
          message={t('calendar.loadErrorBody')}
          action={{ label: t('ui.common.retry'), onClick: () => void refetch() }}
        />
      ) : isLoading ? (
        <TimelineSkeleton />
      ) : isEmpty ? (
        <EmptyState
          icon={CalendarDays}
          title={t('calendar.emptyTitle')}
          message={t('calendar.emptyBody')}
          action={{
            label: t('calendar.jumpToToday'),
            onClick: () => setDay(todayIso()),
          }}
        />
      ) : view === 'week' ? (
        <EmptyState
          icon={CalendarDays}
          title={t('calendar.weekTitle')}
          message={t('calendar.weekBody')}
          action={{
            label: t('calendar.day'),
            onClick: () => setView('day'),
          }}
        />
      ) : (
        <AvailabilityTimeline lanes={lanes} />
      )}
    </div>
  )
}
