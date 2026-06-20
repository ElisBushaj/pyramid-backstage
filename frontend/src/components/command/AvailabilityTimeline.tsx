import { forwardRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/Popover'

/**
 * AvailabilityTimeline — §3.3. The digital-twin surface: a day-view schedule
 * where per-space lanes carry status-colored reservation bars with HATCHED
 * setup/teardown buffer zones. Axis 08:00→20:00. Bars hover into a popover.
 *
 * The buffer geometry is the signature: the outer bar wrapper spans
 * pos(start-setup)→pos(end+teardown); inside it a `.hatch-buffer` setup div, a
 * solid main block (rounded only on edges NOT touching a buffer), and a
 * `.hatch-buffer` teardown div. The hatch class is a transparent-gap background
 * IMAGE, so each buffer's tint (`bufBg`) is set via inline backgroundColor and
 * shows through.
 *
 * Data-driven: pass `lanes`. A 4-lane canvas sample is exported as
 * SAMPLE_TIMELINE_LANES for storybook/preview use.
 */

// Axis constants (the canvas digital twin runs the venue's operating day).
const START_H = 8
const END_H = 20
const SPAN = END_H - START_H // 12

/** % offset along the track for a given decimal hour. */
function pos(h: number): number {
  // Clamp to the visible axis so a reservation (or its buffer) outside 08:00–20:00
  // renders at the edge instead of a negative / >100% offset.
  return Math.max(0, Math.min(100, ((h - START_H) / SPAN) * 100))
}

const HOUR_TICKS = Array.from(
  { length: SPAN / 2 + 1 },
  (_, i) => START_H + i * 2,
) // [8,10,12,14,16,18,20]

export type TimelineStatus = 'confirmed' | 'held' | 'scheduled' | 'conflict'

/**
 * Per-status color set. `bg`/`border` map to semantic tokens via utility
 * classes; `text` and `bufBg` are the canvas's darker derived tints with no
 * token — carried as literals per the digest (§3.3).
 */
interface StatusColorSet {
  /** Tailwind classes for the main block fill + border. */
  block: string
  /** Bar-label ink (literal derived tint). */
  text: string
  /** Buffer-zone tint behind the gray hatch (literal derived tint). */
  bufBg: string
  /** Legend swatch fill class. */
  swatchBg: string
  /** Legend swatch border class. */
  swatchBorder: string
  /** Badge tone for the hover popover. */
  badgeTone: 'success' | 'warning' | 'info' | 'danger'
  /** Human label for the popover badge. */
  badgeLabel: string
}

const STATUS: Record<TimelineStatus, StatusColorSet> = {
  confirmed: {
    block: 'bg-success-subtle border-success',
    text: '#15613A',
    bufBg: '#D7EEE0',
    swatchBg: 'bg-success-subtle',
    swatchBorder: 'border-success',
    badgeTone: 'success',
    badgeLabel: 'CONFIRMED',
  },
  held: {
    block: 'bg-warning-subtle border-warning',
    text: '#7A5500',
    bufBg: '#F1E4C4',
    swatchBg: 'bg-warning-subtle',
    swatchBorder: 'border-warning',
    badgeTone: 'warning',
    badgeLabel: 'HELD',
  },
  scheduled: {
    block: 'bg-info-subtle border-info',
    text: '#244FB0',
    bufBg: '#DCE6FB',
    swatchBg: 'bg-info-subtle',
    swatchBorder: 'border-info',
    badgeTone: 'info',
    badgeLabel: 'SCHEDULED',
  },
  conflict: {
    block: 'bg-danger-subtle border-danger',
    text: '#9E2B23',
    bufBg: '#F3D6D2',
    swatchBg: 'bg-danger-subtle',
    swatchBorder: 'border-danger',
    badgeTone: 'danger',
    badgeLabel: 'CONFLICT',
  },
}

export interface TimelineReservation {
  /** Stable id (used as the popover/react key). Optional — falls back to title. */
  id?: string
  /** Bar label, e.g. "FinTech Startup Conf · 180". */
  title: string
  /** Decimal start hour (e.g. 14 = 14:00, 12.5 = 12:30). */
  start: number
  /** Decimal end hour. */
  end: number
  /** Setup buffer in hours before `start` (the hatched lead-in). */
  setup?: number
  /** Teardown buffer in hours after `end` (the hatched trail-out). */
  teardown?: number
  status: TimelineStatus
  /** Optional richer popover meta (mono lines). Defaults to derived times. */
  detail?: string[]
}

export interface TimelineLane {
  /** Stable id; falls back to `name`. */
  id?: string
  /** Space name, e.g. "Blue Hall". */
  name: string
  /** Capacity for the "cap N" mono label. */
  cap: number
  reservations: TimelineReservation[]
}

export interface AvailabilityTimelineProps
  extends React.HTMLAttributes<HTMLDivElement> {
  lanes?: TimelineLane[]
}

/** Format a decimal hour (14.5 → "14:30"). */
function fmtHour(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Build the default popover meta lines from the bar's window + buffers. */
function defaultDetail(r: TimelineReservation): string[] {
  const lines = [`${fmtHour(r.start)}–${fmtHour(r.end)}`]
  if (r.setup || r.teardown) {
    const parts: string[] = []
    if (r.setup) parts.push(`setup ${fmtHour(r.start - r.setup)}`)
    if (r.teardown) parts.push(`teardown ${fmtHour(r.end + r.teardown)}`)
    lines.push(parts.join(' · '))
  }
  return lines
}

interface LegendItem {
  status: TimelineStatus
  label: string
}
const LEGEND: LegendItem[] = [
  { status: 'confirmed', label: 'confirmed' },
  { status: 'held', label: 'held' },
  { status: 'scheduled', label: 'scheduled' },
  { status: 'conflict', label: 'conflict' },
]

function Legend() {
  return (
    <div className="mb-[18px] flex flex-wrap items-center gap-[18px]">
      {LEGEND.map(({ status, label }) => {
        const c = STATUS[status]
        return (
          <div key={status} className="flex items-center gap-2">
            <span
              className={cn(
                'h-3 w-[14px] rounded-[3px] border',
                c.swatchBg,
                c.swatchBorder,
              )}
              aria-hidden
            />
            <span className="text-[12px] text-text-secondary">{label}</span>
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        <span
          className="hatch-buffer h-3 w-[14px] rounded-[3px]"
          style={{ backgroundColor: '#E3E7EC' }}
          aria-hidden
        />
        <span className="text-[12px] text-text-secondary">
          setup / teardown buffer
        </span>
      </div>
    </div>
  )
}

/** Vertical hour-tick lines + their top labels, shared by every lane track. */
function HourTicks({ withLabels }: { withLabels: boolean }) {
  return (
    <>
      {HOUR_TICKS.map((h) => (
        <div
          key={h}
          className="absolute top-0 bottom-0 border-l border-surface-sunken"
          style={{ left: `${pos(h)}%` }}
          aria-hidden
        >
          {withLabels ? (
            <span className="absolute -top-5 -left-3.5 font-mono text-[11px] text-text-tertiary tabular-nums">
              {fmtHour(h)}
            </span>
          ) : null}
        </div>
      ))}
    </>
  )
}

function Bar({ r }: { r: TimelineReservation }) {
  const [open, setOpen] = useState(false)
  const c = STATUS[r.status]
  const setup = r.setup ?? 0
  const teardown = r.teardown ?? 0

  const outerStart = pos(r.start - setup)
  const outerEnd = pos(r.end + teardown)
  const outerWidth = outerEnd - outerStart
  // Segment widths as a fraction of the wrapper's OWN width (the wrapper is
  // position-relative, so children size off 100% of it).
  const span = r.end + teardown - (r.start - setup)
  const setupPct = span > 0 ? (setup / span) * 100 : 0
  const teardownPct = span > 0 ? (teardown / span) * 100 : 0
  const mainPct = 100 - setupPct - teardownPct

  const detail = r.detail ?? defaultDetail(r)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className="absolute top-2 h-[34px]"
          style={{ left: `${outerStart}%`, width: `${outerWidth}%` }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          tabIndex={0}
          role="button"
          aria-label={r.title}
        >
          {setup > 0 ? (
            <div
              className="hatch-buffer absolute left-0 top-0 h-full rounded-l-md"
              style={{ width: `${setupPct}%`, backgroundColor: c.bufBg }}
              aria-hidden
            />
          ) : null}
          <div
            className={cn(
              'absolute top-0 flex h-full items-center overflow-hidden border px-2.5',
              c.block,
            )}
            style={{
              left: `${setupPct}%`,
              width: `${mainPct}%`,
              borderTopLeftRadius: setup ? 0 : 6,
              borderBottomLeftRadius: setup ? 0 : 6,
              borderTopRightRadius: teardown ? 0 : 6,
              borderBottomRightRadius: teardown ? 0 : 6,
            }}
          >
            <span
              className="whitespace-nowrap text-[12px] font-[600]"
              style={{ color: c.text }}
            >
              {r.title}
            </span>
          </div>
          {teardown > 0 ? (
            <div
              className="hatch-buffer absolute right-0 top-0 h-full rounded-r-md"
              style={{ width: `${teardownPct}%`, backgroundColor: c.bufBg }}
              aria-hidden
            />
          ) : null}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[210px]"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[13px] font-[600] text-text-primary">
            {r.title.split(' · ')[0]}
          </span>
          <Badge tone={c.badgeTone}>{c.badgeLabel}</Badge>
        </div>
        <div className="font-mono text-[12px] leading-[18px] text-text-secondary tabular-nums">
          {detail.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Lane({ lane, first }: { lane: TimelineLane; first: boolean }) {
  return (
    <div
      className={cn(
        'flex',
        !first && 'border-t border-surface-sunken',
      )}
    >
      <div className="w-[150px] shrink-0 border-r border-border-subtle px-4 py-3.5">
        <div className="text-[14px] font-[550] text-text-primary">
          {lane.name}
        </div>
        <div className="font-mono text-[12px] text-text-tertiary tabular-nums">
          cap {lane.cap}
        </div>
      </div>
      <div className="relative h-[52px] flex-1">
        <HourTicks withLabels={first} />
        {lane.reservations.length === 0 ? (
          <span className="absolute left-3 top-[18px] text-[13px] italic text-[#B8BDC6]">
            free
          </span>
        ) : (
          lane.reservations.map((r, i) => (
            <Bar key={r.id ?? `${lane.name}-${r.title}-${i}`} r={r} />
          ))
        )}
      </div>
    </div>
  )
}

/** The canvas's 4-lane mock (§3.3). Use as a preview default. */
export const SAMPLE_TIMELINE_LANES: TimelineLane[] = [
  {
    id: 'blue-hall',
    name: 'Blue Hall',
    cap: 220,
    reservations: [
      {
        id: 'res-fintech',
        title: 'FinTech Startup Conf · 180',
        start: 14,
        end: 18,
        setup: 1.5,
        teardown: 1,
        status: 'confirmed',
        detail: ['180 pax · theater', '14:00–18:00', 'setup 12:30 · teardown 19:00'],
      },
    ],
  },
  {
    id: 'orange-hall',
    name: 'Orange Hall',
    cap: 180,
    reservations: [
      {
        id: 'res-product-launch',
        title: 'Product Launch · 160',
        start: 9,
        end: 12,
        setup: 1,
        teardown: 0.5,
        status: 'scheduled',
      },
    ],
  },
  {
    id: 'amphitheater',
    name: 'Amphitheater',
    cap: 400,
    reservations: [],
  },
  {
    id: 'foyer',
    name: 'Foyer',
    cap: 120,
    reservations: [
      {
        id: 'res-gala-setup',
        title: 'Held — Gala setup',
        start: 16,
        end: 19,
        setup: 2,
        teardown: 1,
        status: 'held',
      },
      {
        id: 'res-mixer',
        title: '⚠ Networking mixer',
        start: 18,
        end: 20,
        status: 'conflict',
      },
    ],
  },
]

export const AvailabilityTimeline = forwardRef<
  HTMLDivElement,
  AvailabilityTimelineProps
>(({ lanes = SAMPLE_TIMELINE_LANES, className, ...props }, ref) => {
  return (
    <div ref={ref} className={className} {...props}>
      <Legend />
      <div
        className="relative overflow-visible rounded-md border border-border-subtle pt-6"
        role="grid"
        aria-label="Availability timeline"
      >
        {lanes.map((lane, i) => (
          <Lane
            key={lane.id ?? lane.name}
            lane={lane}
            first={i === 0}
          />
        ))}
      </div>
    </div>
  )
})
AvailabilityTimeline.displayName = 'AvailabilityTimeline'

export default AvailabilityTimeline
