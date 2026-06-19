import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { AuditEntry } from '@/api/types/audit'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const t = useT()
  if (!entries.length) return <p className="px-1 py-6 text-center text-[14px] text-text-tertiary">{t('audit.empty')}</p>
  return (
    <ol className="flex flex-col">
      {entries.map((e) => (
        <Entry key={e.id} entry={e} />
      ))}
    </ol>
  )
}

function Entry({ entry }: { entry: AuditEntry }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const [open, setOpen] = useState(false)
  const hasDiff = entry.before || entry.after || entry.reason
  return (
    <li className="flex gap-3 border-l border-border-subtle pb-4 pl-4 last:pb-0">
      <span className="-ml-[21px] mt-1 size-2.5 shrink-0 rounded-pill border-2 border-surface bg-border-strong" aria-hidden />
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-[550] text-text-primary">{entry.actorName ?? 'system'}</span>
          <span className="font-mono text-[12px] text-accent">{entry.action}</span>
          <span className="text-[12px] text-text-tertiary">{entry.entityType}</span>
          <span className="ml-auto font-mono text-[12px] text-text-tertiary">{formatDateTime(entry.at, locale)}</span>
        </div>
        {hasDiff ? (
          <button onClick={() => setOpen((v) => !v)} className="mt-0.5 flex w-fit items-center gap-1 text-[12px] text-text-tertiary hover:text-text-secondary">
            <ChevronRight className={cn('size-3 transition-transform', open && 'rotate-90')} />
            {open ? t('audit.before') + ' / ' + t('audit.after') : t('audit.reason')}
          </button>
        ) : null}
        {open ? (
          <div className="mt-1 grid gap-2 rounded-sm bg-surface-subtle p-2 text-[12px] sm:grid-cols-2">
            {entry.reason ? <p className="sm:col-span-2 text-text-secondary"><span className="text-text-tertiary">{t('audit.reason')}: </span>{entry.reason}</p> : null}
            {entry.before ? <pre className="overflow-x-auto font-mono text-text-tertiary"><b className="text-text-secondary">{t('audit.before')}</b>{'\n'}{JSON.stringify(entry.before, null, 1)}</pre> : null}
            {entry.after ? <pre className="overflow-x-auto font-mono text-text-tertiary"><b className="text-text-secondary">{t('audit.after')}</b>{'\n'}{JSON.stringify(entry.after, null, 1)}</pre> : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
