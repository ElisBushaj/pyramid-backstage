import type { ScheduleEntry } from '@/api/types/reservations'
import type { TimelineLane, TimelineReservation } from '@/components/command/AvailabilityTimeline'

const VENUE_TZ = 'Europe/Tirana'

/** ISO instant → decimal hour-of-day in VENUE time (14:30 in Tirana → 14.5). (XC-7) */
function venueDecimalHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VENUE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  // Intl can render midnight as "24"; normalise to 0.
  return (h % 24) + m / 60
}

interface SpaceLike {
  id: string
  name: string
  capacities?: Record<string, number>
}

function capOf(s: SpaceLike): number {
  const caps = Object.values(s.capacities ?? {})
  return caps.length ? Math.max(...caps) : 0
}

/**
 * Map live reservation windows (ADR-0016 ScheduleEntry) → timeline bars, with
 * venue-pinned hour positions and setup/teardown buffers. A reservation whose
 * request is in `conflictRequestIds` renders as a conflict bar.
 */
export function scheduleToBars(entries: ScheduleEntry[], conflictRequestIds: string[] = []): TimelineReservation[] {
  const conflicts = new Set(conflictRequestIds)
  return entries.map((e) => ({
    id: e.id,
    title: `${e.requestTitle} · ${e.attendees}`,
    start: venueDecimalHour(e.start),
    end: venueDecimalHour(e.end),
    setup: e.setupBufferMinutes ? e.setupBufferMinutes / 60 : undefined,
    teardown: e.teardownBufferMinutes ? e.teardownBufferMinutes / 60 : undefined,
    status: conflicts.has(e.requestId) ? 'conflict' : e.status === 'HELD' ? 'held' : 'confirmed',
  }))
}

/**
 * Build timeline lanes from the space catalog + the day's live reservations:
 * one lane per space (scaffold = name + max capacity), its bars grouped by
 * spaceId. Replaces the old SAMPLE_TIMELINE_LANES graft with real data (XC-1).
 */
export function scheduleToLanes(spaces: SpaceLike[], entries: ScheduleEntry[], conflictRequestIds: string[] = []): TimelineLane[] {
  const bySpace = new Map<string, ScheduleEntry[]>()
  for (const e of entries) {
    const arr = bySpace.get(e.spaceId) ?? []
    arr.push(e)
    bySpace.set(e.spaceId, arr)
  }
  return spaces.map((s) => ({
    id: s.id,
    name: s.name,
    cap: capOf(s),
    reservations: scheduleToBars(bySpace.get(s.id) ?? [], conflictRequestIds),
  }))
}
