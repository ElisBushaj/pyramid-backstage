import { useMemo, useState } from 'react'
import { useSpaces } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import type { Space, SpaceMap } from '@/api/types/spaces'
import type { OperationalPlan } from '@/api/types/ai'

// F19 — v1 radial FloorMap / digital twin (ADR-0014). Renders the catalog `map` field
// (16-axis ring) and colours each space by the AI plan status. Self-contained: geometry
// comes from GET /spaces (F14), status from the `spaces` prop. Alvin's component can
// drop into the same prop contract: <FloorMap floor spaces={[{ slug, status }]} />.

export type FloorStatus = 'free' | 'main' | 'bundle' | 'conflict' | 'circulation'
export interface FloorMapSpace {
  slug: string
  status: FloorStatus
}

export const FLOORS = [3, 0, -1] as const

// status → SVG style. CSS vars adapt to dark mode; dashed circulation reads as "access affected".
const STYLE: Record<FloorStatus, { fill: string; stroke: string; text: string; dash?: string }> = {
  free: { fill: 'var(--surface-subtle, #F2F4F7)', stroke: 'var(--border-subtle, #E2E7EE)', text: 'var(--text-tertiary, #8A92A0)' },
  circulation: { fill: 'var(--surface-subtle, #F2F4F7)', stroke: 'var(--accent, #2F6FED)', text: 'var(--text-secondary, #5A6472)', dash: '4 3' },
  bundle: { fill: 'var(--accent-muted, #EEF3FE)', stroke: 'var(--accent, #2F6FED)', text: 'var(--accent, #2F6FED)' },
  main: { fill: 'var(--accent, #2F6FED)', stroke: 'var(--accent-pressed, #244FB0)', text: '#FFFFFF' },
  conflict: { fill: 'var(--danger, #C8372D)', stroke: 'var(--danger-pressed, #94271F)', text: '#FFFFFF' },
}

const C = 160
const R_OUTER = 152
const R_MID = 106
const R_INNER = 62

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
  return [R_MID, R_OUTER] // outer
}

/** The pure renderer — matches the agreed prop contract exactly. */
export function FloorMap({ floor, spaces, className }: { floor: number; spaces: FloorMapSpace[]; className?: string }) {
  const t = useT()
  const all = useSpaces({}).data ?? []
  const statusBy = useMemo(() => new Map(spaces.map((s) => [s.slug, s.status])), [spaces])
  const onFloor = all.filter((s) => s.floor === floor && s.map)

  return (
    <svg viewBox="0 0 320 320" className={cn('w-full', className)} role="img" aria-label={t('floorMap.aria', { floor })}>
      {/* faint structural grid: rings + 16 axes */}
      <circle cx={C} cy={C} r={R_OUTER} fill="none" stroke="var(--border-subtle, #E2E7EE)" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_MID} fill="none" stroke="var(--border-subtle, #E2E7EE)" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_INNER} fill="none" stroke="var(--border-subtle, #E2E7EE)" strokeWidth={1} />
      {Array.from({ length: 16 }, (_, i) => (
        <line key={i} x1={C} y1={C} x2={P(R_OUTER, i * 22.5).split(',')[0]} y2={P(R_OUTER, i * 22.5).split(',')[1]} stroke="var(--border-subtle, #E2E7EE)" strokeWidth={0.5} opacity={0.5} />
      ))}

      {onFloor.map((s) => {
        const status = (statusBy.get(s.slug ?? '') ?? 'free') as FloorStatus
        return <SpaceShape key={s.id} space={s} map={s.map!} status={status} />
      })}
    </svg>
  )
}

function SpaceShape({ space, map, status }: { space: Space; map: SpaceMap; status: FloorStatus }) {
  const st = STYLE[status]
  const labelOn = status !== 'free'

  if (map.ring === 'center' || map.sectorFrom == null || map.sectorTo == null) {
    // Circulation cores / atria have no sectors → render the inner disc.
    return (
      <g>
        <circle cx={C} cy={C} r={R_INNER - 4} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash}>
          <title>{space.name}</title>
        </circle>
        {labelOn && <text x={C} y={C} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600} fill={st.text}>{abbr(space.name)}</text>}
      </g>
    )
  }

  const [rIn, rOut] = bandFor(map.ring)
  const dStart = (map.sectorFrom - 1) * 22.5
  const dEnd = map.sectorTo * 22.5
  const midDeg = (dStart + dEnd) / 2
  const [lx, ly] = P((rIn + rOut) / 2, midDeg).split(',')

  return (
    <g>
      <path d={sectorPath(rIn, rOut, dStart, dEnd)} fill={st.fill} stroke={st.stroke} strokeWidth={1.5} strokeDasharray={st.dash} strokeLinejoin="round">
        <title>{space.name}</title>
      </path>
      {labelOn && <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize={8.5} fontWeight={600} fill={st.text}>{abbr(space.name)}</text>}
    </g>
  )
}

function abbr(name: string): string {
  return name.split(/\s|—|-/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/** Embeddable panel: a floor switcher + legend around the renderer. Pages use this. */
export function FloorMapPanel({ spaces, title, className }: { spaces: FloorMapSpace[]; title?: string; className?: string }) {
  const t = useT()
  const all = useSpaces({}).data ?? []
  const slugFloor = useMemo(() => new Map(all.map((s) => [s.slug ?? '', s.floor])), [all])
  // Default to the floor carrying the most lit (non-free) spaces.
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
  // `floor` stays null until the user picks one, so the view follows defaultFloor as the
  // async space data arrives (a useState initializer runs only once, on first mount).
  const [floor, setFloor] = useState<number | null>(null)
  const activeFloor = floor ?? defaultFloor

  const legend: FloorStatus[] = ['main', 'bundle', 'conflict', 'circulation']

  return (
    <section className={cn('rounded-lg border border-border-subtle p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-[600] text-text-primary">{title ?? t('floorMap.title')}</h2>
        <div className="inline-flex rounded-control border border-border-subtle p-0.5">
          {FLOORS.map((f) => (
            <button
              key={f}
              onClick={() => setFloor(f)}
              className={cn('rounded-[6px] px-2.5 py-1 text-[12px] font-[600] tabular-nums', activeFloor === f ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:bg-surface-sunken')}
            >
              {t('floorMap.floor')} {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-[340px]">
        <FloorMap floor={activeFloor} spaces={spaces} />
      </div>

      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {legend.map((s) => (
          <li key={s} className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <span className="size-2.5 rounded-[3px]" style={{ background: STYLE[s].fill, border: `1.5px ${STYLE[s].dash ? 'dashed' : 'solid'} ${STYLE[s].stroke}` }} />
            {t(`floorMap.legend.${s}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * F19-T03 — derive the {slug,status}[] from a plan / reservation context.
 * chosen → main; its transitional/foyer neighbours → bundle; circulation neighbours →
 * circulation; conflicting spaces → conflict. Grounded in the catalog adjacency.
 */
export function deriveFloorStatuses(
  allSpaces: Space[],
  opts: { chosenSpaceId?: string | null; conflictSpaceIds?: string[]; plan?: OperationalPlan | null },
): FloorMapSpace[] {
  const byId = new Map(allSpaces.map((s) => [s.id, s]))
  const out = new Map<string, FloorStatus>()

  const chosenId = opts.plan?.space?.id ?? opts.chosenSpaceId
  const chosen = chosenId ? byId.get(chosenId) : undefined
  if (chosen?.slug) {
    out.set(chosen.slug, 'main')
    for (const adjSlug of chosen.adjacent ?? []) {
      const adj = allSpaces.find((s) => s.slug === adjSlug)
      if (!adj?.slug) continue
      out.set(adj.slug, adj.isCirculation ? 'circulation' : 'bundle')
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
