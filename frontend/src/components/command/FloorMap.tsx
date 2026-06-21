import { useMemo, useState } from 'react'
import { useSpaces, useBookings, type SpaceBooking } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import type { Space, SpaceMap } from '@/api/types/spaces'
import type { OperationalPlan } from '@/api/types/ai'
import { FLOOR_PLANS } from './floorplan.data'

// F19 — radial FloorMap / digital twin (ADR-0014). A "venue model": every space is
// always colour-coded by TYPE (event hall / box / WC / technical / circulation) over the
// real traced plan, and the AI plan lights its spaces on top. Geometry + kind come from
// GET /spaces (F14, real floor model); plan status from the `spaces` prop.
// Contract preserved: <FloorMap floor spaces={[{ slug, status }]} />.

export type FloorStatus = 'free' | 'main' | 'bundle' | 'conflict' | 'circulation'
export interface FloorMapSpace {
  slug: string
  status: FloorStatus
}

export const FLOORS = [3, 0, -1] as const
export type VenueCat = 'all' | 'halls' | 'boxes' | 'wc' | 'technical' | 'circulation'

// ── venue palette: space KIND → fill + filter category + legend key. ─────────────────
const KIND: Record<string, { fill: string; cat: Exclude<VenueCat, 'all'>; legend: string }> = {
  main_hall: { fill: '#2f93a3', cat: 'halls', legend: 'event_hall' },
  annex_hall: { fill: '#2f93a3', cat: 'halls', legend: 'event_hall' },
  perimeter_hall: { fill: '#2f93a3', cat: 'halls', legend: 'event_hall' },
  mid_ring_hall: { fill: '#2f93a3', cat: 'halls', legend: 'event_hall' },
  outdoor_terrace: { fill: '#3f9e6b', cat: 'halls', legend: 'terrace' },
  box: { fill: '#c2974a', cat: 'boxes', legend: 'box' },
  rim_room: { fill: '#c2974a', cat: 'boxes', legend: 'box' },
  circulation_feature: { fill: '#8a7b52', cat: 'circulation', legend: 'core' },
  outdoor_stairs: { fill: '#5b6b7d', cat: 'circulation', legend: 'core' },
  circulation: { fill: '#46607a', cat: 'circulation', legend: 'circulation' },
  entrance_plaza: { fill: '#46607a', cat: 'circulation', legend: 'circulation' },
  entrance_vestibule: { fill: '#46607a', cat: 'circulation', legend: 'circulation' },
  wc: { fill: '#b5763e', cat: 'wc', legend: 'wc' },
  technical: { fill: '#a8503f', cat: 'technical', legend: 'technical' },
}
const DEFAULT_KIND = { fill: '#46607a', cat: 'circulation' as const, legend: 'circulation' }
// AI-plan overlay colours (bright on the dark venue model).
const STATUS_FILL: Record<FloorStatus, string> = {
  main: '#3b82f6', bundle: '#7cc4f0', conflict: '#ef4444', circulation: '#60a5fa', free: '',
}
const LEGEND_KINDS = ['event_hall', 'box', 'wc', 'technical', 'circulation', 'core'] as const
const LEGEND_FILL: Record<string, string> = {
  event_hall: '#2f93a3', box: '#c2974a', wc: '#b5763e', technical: '#a8503f',
  circulation: '#46607a', core: '#8a7b52', terrace: '#3f9e6b',
}
const FILTERS: VenueCat[] = ['all', 'halls', 'boxes', 'wc', 'technical', 'circulation']
// Real floor datums (m vs Floor-0), from the architect spec.
const DATUM: Record<string, string> = { '0': '+0.00', '-1': '−4.65', '3': '+12.8' }

// ── v1 radial fallback geometry (only used when a floor has no traced polygons) ──────
const C = 160, R_OUTER = 152, R_MID = 106, R_INNER = 62
function P(r: number, deg: number): string {
  const a = ((deg - 90) * Math.PI) / 180
  return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`
}
function sectorPath(rIn: number, rOut: number, dStart: number, dEnd: number): string {
  const large = dEnd - dStart > 180 ? 1 : 0
  return `M ${P(rOut, dStart)} A ${rOut} ${rOut} 0 ${large} 1 ${P(rOut, dEnd)} L ${P(rIn, dEnd)} A ${rIn} ${rIn} 0 ${large} 0 ${P(rIn, dStart)} Z`
}
function bandFor(ring: string): [number, number] {
  if (ring === 'center') return [0, R_INNER]
  if (ring === 'corridor') return [R_INNER, R_MID]
  return [R_MID, R_OUTER]
}

function centroid(poly: number[][]): [number, number] {
  const x = poly.reduce((a, [px]) => a + px, 0) / poly.length
  const y = poly.reduce((a, [, py]) => a + py, 0) / poly.length
  return [x, y]
}
function catOf(s: Space): Exclude<VenueCat, 'all'> {
  return (KIND[s.map?.spaceKind ?? ''] ?? DEFAULT_KIND).cat
}

/** Pure renderer — the agreed prop contract, plus optional venue controls. */
export function FloorMap({
  floor, spaces, className, filter = 'all', selectedSlug, onSelect, bookedBySlug,
}: {
  floor: number
  spaces: FloorMapSpace[]
  className?: string
  filter?: VenueCat
  selectedSlug?: string | null
  onSelect?: (s: Space) => void
  bookedBySlug?: Map<string, SpaceBooking>
}) {
  const t = useT()
  const all = useSpaces({}).data ?? []
  const statusBy = useMemo(() => new Map(spaces.map((s) => [s.slug, s.status])), [spaces])
  const onFloor = all.filter((s) => s.floor === floor && s.map)
  const planActive = spaces.some((s) => s.status !== 'free')
  const planURL = FLOOR_PLANS[String(floor)]

  if (planURL && onFloor.some((s) => s.map?.polygon?.length)) {
    return (
      <VenueFloor
        floor={floor} onFloor={onFloor} statusBy={statusBy} planActive={planActive}
        filter={filter} selectedSlug={selectedSlug} onSelect={onSelect}
        bookedBySlug={bookedBySlug} className={className}
      />
    )
  }

  // v1 schematic fallback (no traced polygons for this floor)
  return (
    <svg viewBox="0 0 320 320" className={cn('w-full', className)} role="img" aria-label={t('floorMap.aria', { floor })}>
      <circle cx={C} cy={C} r={R_OUTER} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_MID} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
      {onFloor.map((s) => {
        const status = (statusBy.get(s.slug ?? '') ?? 'free') as FloorStatus
        return <SpaceShape key={s.id} space={s} map={s.map!} status={status} />
      })}
    </svg>
  )
}

/** The venue model — kind-coloured wedges over the real plan, AI plan lit on top. */
function VenueFloor({
  floor, onFloor, statusBy, planActive, filter, selectedSlug, onSelect, bookedBySlug, className,
}: {
  floor: number
  onFloor: Space[]
  statusBy: Map<string, FloorStatus>
  planActive: boolean
  filter: VenueCat
  selectedSlug?: string | null
  onSelect?: (s: Space) => void
  bookedBySlug?: Map<string, SpaceBooking>
  className?: string
}) {
  const t = useT()
  const plan = FLOOR_PLANS[String(floor)]
  // draw circulation/rings first (they're the big background annuli), rooms on top
  const ordered = [...onFloor].sort((a, b) => (catOf(a) === 'circulation' ? 0 : 1) - (catOf(b) === 'circulation' ? 0 : 1))

  return (
    <svg viewBox={plan.viewBox} className={cn('w-full', className)} role="img" aria-label={t('floorMap.aria', { floor })}>
      <defs>
        <pattern id="fm-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#5b6b7d" fillOpacity="0.25" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#9fb0c4" strokeWidth="1.2" strokeOpacity="0.5" />
        </pattern>
      </defs>
      {/* faint real-plan silhouette under the colour blocks (subtle "real building" texture) */}
      <path d={plan.structural} fill="none" stroke="rgba(173,196,224,0.08)" strokeWidth={1} strokeLinejoin="round" />

      {ordered.map((s) => {
        const poly = s.map?.polygon
        if (!poly?.length) return null
        const pts = poly.map(([x, y]) => `${x},${y}`).join(' ')
        const k = KIND[s.map?.spaceKind ?? ''] ?? DEFAULT_KIND
        const status = (statusBy.get(s.slug ?? '') ?? 'free') as FloorStatus
        const inPlan = status !== 'free'
        const conditional = s.map?.bookable === 'conditional'
        const dimmed = filter !== 'all' && k.cat !== filter
        const selected = selectedSlug === s.slug
        const booked = bookedBySlug?.get(s.slug ?? '')
        const [cx, cy] = centroid(poly)

        let fill = conditional ? 'url(#fm-hatch)' : k.fill
        let fillOpacity = 0.85
        let stroke = 'rgba(8,18,28,0.55)'
        let strokeWidth = 1
        if (inPlan) { fill = STATUS_FILL[status]; fillOpacity = 0.95; stroke = '#dbeafe'; strokeWidth = 2.5 }
        if (planActive && !inPlan) fillOpacity = 0.4
        if (dimmed) fillOpacity = 0.06
        if (selected) { stroke = '#ffffff'; strokeWidth = 2.5 }

        const showLabel = !dimmed && poly.length > 3
        return (
          <g key={s.id} onClick={() => onSelect?.(s)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
            <polygon points={pts} fill={fill} fillOpacity={fillOpacity} stroke={stroke}
              strokeWidth={strokeWidth} strokeLinejoin="round">
              <title>{booked ? `${s.name} · booked: ${booked.title}` : s.name}</title>
            </polygon>
            {/* live booking: a gold ring (dashed = held, solid = confirmed) */}
            {booked && !dimmed && (
              <polygon points={pts} fill="none" stroke="#f0b429" strokeWidth={3}
                strokeDasharray={booked.status === 'HELD' ? '7 4' : undefined}
                strokeLinejoin="round" pointerEvents="none" />
            )}
            {showLabel && (
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={14}
                fontWeight={600} fill={dimmed ? 'transparent' : '#eef4fb'}
                style={{ paintOrder: 'stroke', stroke: 'rgba(8,18,28,0.55)', strokeWidth: 3 }}>
                {shortLabel(s.name)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

const STYLE: Record<FloorStatus, { fill: string; stroke: string; text: string; dash?: string }> = {
  free: { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(255,255,255,0.15)', text: '#9fb0c4' },
  circulation: { fill: 'rgba(96,165,250,0.18)', stroke: '#60a5fa', text: '#cfe0f5', dash: '4 3' },
  bundle: { fill: 'rgba(124,196,240,0.30)', stroke: '#7cc4f0', text: '#dbeafe' },
  main: { fill: '#3b82f6', stroke: '#1d4ed8', text: '#ffffff' },
  conflict: { fill: '#ef4444', stroke: '#991b1b', text: '#ffffff' },
}

function SpaceShape({ space, map, status }: { space: Space; map: SpaceMap; status: FloorStatus }) {
  const st = STYLE[status]
  const labelOn = status !== 'free'
  if (map.ring === 'center' || map.sectorFrom == null || map.sectorTo == null) {
    return (
      <g>
        <circle cx={C} cy={C} r={R_INNER - 4} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash}>
          <title>{space.name}</title>
        </circle>
        {labelOn && <text x={C} y={C} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600} fill={st.text}>{shortLabel(space.name)}</text>}
      </g>
    )
  }
  const [rIn, rOut] = bandFor(map.ring)
  const dStart = (map.sectorFrom - 1) * 22.5
  const dEnd = map.sectorTo * 22.5
  const [lx, ly] = P((rIn + rOut) / 2, (dStart + dEnd) / 2).split(',')
  return (
    <g>
      <path d={sectorPath(rIn, rOut, dStart, dEnd)} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash} strokeLinejoin="round">
        <title>{space.name}</title>
      </path>
      {labelOn && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8.5} fontWeight={600} fill={st.text}>{shortLabel(space.name)}</text>}
    </g>
  )
}

function abbr(name: string): string {
  return name.split(/\s|—|-/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
// Numbered rooms keep their FULL plan number (Space 1/13 → S1/S13, Box 7 → B7); else initials.
function shortLabel(name: string): string {
  const m = name.match(/\b(Space|Box)\s+(\d+(?:\.\d+)?)/i)
  return m ? `${m[1][0].toUpperCase()}${m[2]}` : abbr(name)
}

/** Embeddable venue-model panel: dark surface, floor switcher, filters, legend, tap-detail. */
export function FloorMapPanel({ spaces, title, className }: { spaces: FloorMapSpace[]; title?: string; className?: string }) {
  const t = useT()
  const all = useSpaces({}).data ?? []
  const bookings = useBookings().data ?? {}
  // map current bookings (keyed by spaceId) onto slugs the FloorMap understands
  const bookedBySlug = useMemo(() => {
    const m = new Map<string, SpaceBooking>()
    for (const s of all) { const b = bookings[s.id]; if (b && s.slug) m.set(s.slug, b) }
    return m
  }, [all, bookings])
  const slugFloor = useMemo(() => new Map(all.map((s) => [s.slug ?? '', s.floor])), [all])
  const defaultFloor = useMemo(() => {
    const counts = new Map<number, number>()
    for (const s of spaces) {
      const f = slugFloor.get(s.slug)
      if (f != null && s.status !== 'free') counts.set(f, (counts.get(f) ?? 0) + 1)
    }
    let best = 0, bestN = -1
    for (const [f, n] of counts) if (n > bestN) { best = f; bestN = n }
    return best
  }, [spaces, slugFloor])

  const [floor, setFloor] = useState<number | null>(null)
  const [filter, setFilter] = useState<VenueCat>('all')
  const [selected, setSelected] = useState<Space | null>(null)
  const activeFloor = floor ?? defaultFloor

  const onFloor = all.filter((s) => s.floor === activeFloor && s.map)
  const bookable = onFloor.filter((s) => s.map?.bookable === true).length
  const sel = selected && selected.floor === activeFloor ? selected : null
  const selBooking = sel ? bookedBySlug.get(sel.slug ?? '') : undefined

  return (
    <section
      className={cn('rounded-xl border p-5', className)}
      style={{ background: 'linear-gradient(160deg,#102536 0%,#0b1822 100%)', borderColor: 'rgba(173,196,224,0.12)', color: '#e7eef6' }}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-[700] uppercase tracking-[0.18em]" style={{ color: '#5fb3c4' }}>
            {t('floorMap.venue.eyebrow')}
          </div>
          <h2 className="text-[18px] font-[700]" style={{ color: '#f2f7fc' }}>
            {title ?? t('floorMap.venue.floor', { floor: activeFloor })}
          </h2>
          <p className="text-[12px]" style={{ color: '#9fb4cc' }}>
            {t('floorMap.venue.meta', { level: DATUM[String(activeFloor)] ?? '0', count: onFloor.length, bookable })}
          </p>
        </div>
        <div className="inline-flex rounded-control p-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {FLOORS.map((f) => (
            <button key={f} onClick={() => { setFloor(f); setSelected(null) }}
              className="rounded-[6px] px-2.5 py-1 text-[12px] font-[600] tabular-nums transition-colors"
              style={activeFloor === f
                ? { background: '#2f93a3', color: '#06222a' }
                : { color: '#c4d4e6' }}>
              {t('floorMap.floor')} {f}
            </button>
          ))}
        </div>
      </div>

      {/* category filters */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((c) => (
          <button key={c} onClick={() => setFilter(c)}
            className="rounded-full px-2.5 py-[3px] text-[11px] font-[600] transition-colors"
            style={filter === c
              ? { background: '#e7eef6', color: '#0b1822' }
              : { background: 'rgba(255,255,255,0.06)', color: '#aebfd2' }}>
            {t(`floorMap.venue.filters.${c}`)}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-[560px]">
        <FloorMap
          floor={activeFloor} spaces={spaces} filter={filter}
          selectedSlug={sel?.slug} onSelect={setSelected} bookedBySlug={bookedBySlug}
        />
      </div>

      {/* tap-a-space detail */}
      {sel && (
        <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="font-[700]" style={{ color: '#f2f7fc' }}>{sel.name}</span>
          <span style={{ color: '#9fb4cc' }}>
            {' · '}{t(`floorMap.venue.kind.${(KIND[sel.map?.spaceKind ?? ''] ?? DEFAULT_KIND).legend}`)}
            {sel.map?.level != null && ` · ${sel.map.level} m`}
            {sel.map?.areaApproxM2 && ` · ≈${sel.map.areaApproxM2} m²`}
            {Object.keys(sel.capacities ?? {}).length > 0 &&
              ` · ${Math.max(...Object.values(sel.capacities))} ${t('floorMap.venue.seats')}`}
            {sel.map?.bookable === false && ` · ${t('floorMap.venue.notBookable')}`}
          </span>
          {selBooking && (
            <div className="mt-1 font-[600]" style={{ color: '#f0b429' }}>
              {t('floorMap.venue.bookedBy', { title: selBooking.title })} · {selBooking.start.slice(0, 10)}
              {' · '}{t(`floorMap.venue.${selBooking.status === 'CONFIRMED' ? 'confirmed' : 'held'}`)}
            </div>
          )}
        </div>
      )}

      {/* kind legend + the live-booking ring */}
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {LEGEND_KINDS.map((k) => (
          <li key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: '#9fb4cc' }}>
            <span className="size-2.5 rounded-[3px]" style={{ background: LEGEND_FILL[k] }} />
            {t(`floorMap.venue.kind.${k}`)}
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-[11px]" style={{ color: '#9fb4cc' }}>
          <span className="size-2.5 rounded-full" style={{ border: '2px solid #f0b429' }} />
          {t('floorMap.venue.booked')}
        </li>
      </ul>
    </section>
  )
}

/**
 * F19-T03 — derive the {slug,status}[] from a plan / reservation context.
 * chosen → main; bundle/circulation neighbours; conflicting spaces → conflict.
 */
export function deriveFloorStatuses(
  allSpaces: Space[],
  opts: { chosenSpaceId?: string | null; conflictSpaceIds?: string[]; plan?: OperationalPlan | null },
): FloorMapSpace[] {
  const byId = new Map(allSpaces.map((s) => [s.id, s]))
  const out = new Map<string, FloorStatus>()
  // The AI plan already carries the lit spaces (main + bundle + overflow) on its mapState.
  for (const m of opts.plan?.mapState ?? []) {
    if (m?.slug && m?.status) out.set(m.slug, m.status as FloorStatus)
  }
  const chosenId = opts.plan?.space?.id ?? opts.chosenSpaceId
  const chosen = chosenId ? byId.get(chosenId) : undefined
  if (chosen?.slug && !out.has(chosen.slug)) {
    out.set(chosen.slug, 'main')
    for (const adjSlug of chosen.adjacent ?? []) {
      const adj = allSpaces.find((s) => s.slug === adjSlug)
      if (adj?.slug && !out.has(adj.slug)) out.set(adj.slug, adj.isCirculation ? 'circulation' : 'bundle')
    }
  }
  const conflictIds = (opts.conflictSpaceIds && opts.conflictSpaceIds.length)
    ? opts.conflictSpaceIds
    : (opts.plan?.conflicts?.map((c) => c.spaceId).filter(Boolean) as string[] | undefined)
  for (const cid of conflictIds ?? []) {
    const cs = byId.get(cid)
    if (cs?.slug) out.set(cs.slug, 'conflict')
  }
  return [...out].map(([slug, status]) => ({ slug, status }))
}
