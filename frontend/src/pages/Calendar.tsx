import { useMemo, useState } from 'react'
import { useSpaces, useSchedule } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import {
  AvailabilityTimeline,
  type TimelineLane,
} from '@/components/command/AvailabilityTimeline'
import { scheduleToLanes, venueToday, venueDayWindow, shiftDay } from '@/lib/schedule'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

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
 * status-colored reservation bars with hatched setup/teardown buffers, hover
 * popover, and a legend. Lanes are built from `useSpaces()` (the space catalog)
 * and `useSchedule()` (the day's live reservation windows) via
 * `scheduleToLanes` — no sample graft (XC-1). Buffers and venue-tz positioning
 * are handled inside lib/schedule.
 */
export default function Calendar() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [day, setDay] = useState(venueToday())

  // The full venue-local day window (Tirana midnight → next midnight, DST-aware).
  const { start, end } = venueDayWindow(day)

  const {
    data: spaces,
    isLoading: spacesLoading,
    isError: spacesError,
    refetch: refetchSpaces,
  } = useSpaces({ start, end })
  const {
    data: entries,
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useSchedule({ start, end })

  const isLoading = spacesLoading || scheduleLoading
  const isError = spacesError || scheduleError

  const lanes = useMemo<TimelineLane[]>(() => {
    if (!spaces || spaces.length === 0) return []
    return scheduleToLanes(spaces, entries ?? [])
  }, [spaces, entries])

  // §4.4 empty surface: no spaces at all, OR a day on which every lane resolves
  // free ("No reservations on this day. All spaces are free.").
  const isEmpty =
    lanes.length === 0 || lanes.every((lane) => lane.reservations.length === 0)

  const subtitle = formatLongDate(day, locale)

  const headerActions = (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-label={t('calendar.prevDay')}
        onClick={() => setDay(shiftDay(day, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="date"
        lang="en-GB"
        value={day}
        aria-label={t('calendar.pickDate')}
        onChange={(e) => e.target.value && setDay(e.target.value)}
        className="h-9 rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary [color-scheme:light]"
      />
      <Button
        size="sm"
        variant="secondary"
        aria-label={t('calendar.nextDay')}
        onClick={() => setDay(shiftDay(day, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setDay(venueToday())}>
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
          action={{
            label: t('ui.common.retry'),
            onClick: () => {
              void refetchSpaces()
              void refetchSchedule()
            },
          }}
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
            onClick: () => setDay(venueToday()),
          }}
        />
      ) : (
        <AvailabilityTimeline lanes={lanes} />
      )}
    </div>
  )
}
