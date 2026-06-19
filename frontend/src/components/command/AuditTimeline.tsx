import { useState } from 'react'
import type { AuditEntry } from '@/api/types/audit'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateTime } from '@/lib/format'
import { Avatar } from '@/components/ui/Avatar'

/**
 * AuditTimeline — §3.11. A vertical thread: per entry a tinted 28px avatar, a 2px
 * connector dropping to the next, then actor · verb · mono entity, a mono
 * timestamp, an always-visible quoted reason well, and an optional diff toggle.
 */

const AVATAR_TINTS = [
  'bg-[#DCE6FB]', // blue
  'bg-success-subtle', // green
  'bg-warning-subtle', // amber
  'bg-accent-muted', // info
  'bg-surface-sunken', // gray
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SY'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function tintFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]
}

/** "REQUEST_APPROVED" / "request.approved" → "approved". */
function humanizeVerb(action: string): string {
  return action.replace(/[._]/g, ' ').toLowerCase()
}

/** Build a "field: BEFORE → AFTER" line from the first changed scalar field. */
function diffLine(entry: AuditEntry): string | null {
  const before = entry.before
  const after = entry.after
  if (!before && !after) return null
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const key of keys) {
    const b = before?.[key]
    const a = after?.[key]
    if (b === a) continue
    if (isScalar(b) && isScalar(a)) {
      return `${key}: ${String(b)} → ${String(a)}`
    }
  }
  return null
}

function isScalar(v: unknown): v is string | number | boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const t = useT()
  if (!entries.length)
    return <p className="px-1 py-6 text-center text-[14px] text-text-tertiary">{t('audit.empty')}</p>
  return (
    <div className="relative pl-2">
      {entries.map((e, i) => (
        <Entry key={e.id} entry={e} last={i === entries.length - 1} />
      ))}
    </div>
  )
}

function Entry({ entry, last }: { entry: AuditEntry; last: boolean }) {
  const locale = useLocaleStore((s) => s.locale)
  const [open, setOpen] = useState(false)
  const actor = entry.actorName ?? 'System'
  const diff = diffLine(entry)
  return (
    <div className={'relative flex gap-3.5 ' + (last ? 'pb-0' : 'pb-[22px]')}>
      {!last ? (
        <span className="absolute bottom-0 left-[13px] top-[30px] w-0.5 bg-border-subtle" aria-hidden />
      ) : null}
      <Avatar
        size="md"
        initials={initials(actor)}
        fallbackClassName={tintFor(actor)}
        className="relative z-[1]"
        aria-label={actor}
      />
      <div className="flex-1">
        <p className="text-[14px] leading-5">
          <span className="font-[600] text-text-primary">{actor}</span>
          <span className="text-text-secondary"> {humanizeVerb(entry.action)} </span>
          <span className="font-mono text-[13px] text-accent">{entry.entityId}</span>
        </p>
        <p className="mt-0.5 font-mono text-[12px] tabular-nums text-text-tertiary">
          {formatDateTime(entry.at, locale)}
        </p>
        {entry.reason ? (
          <p className="mt-1.5 rounded-r-sm border-l-2 border-border-strong bg-surface-subtle px-2.5 py-1.5 text-[13px] text-text-secondary">
            &ldquo;{entry.reason}&rdquo;
          </p>
        ) : null}
        {diff ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 block text-left text-[12px] text-accent"
          >
            {open ? '▾' : '▸'} {diff}
          </button>
        ) : null}
      </div>
    </div>
  )
}
