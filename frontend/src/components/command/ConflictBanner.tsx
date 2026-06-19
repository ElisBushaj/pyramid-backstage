import { AlertTriangle } from 'lucide-react'
import type { Conflict } from '@/api/types/_envelope'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDateRange } from '@/lib/format'

/**
 * The signature moment — renders a Conflict[] as a calm danger-tinted explainer
 * (DESIGN_SYSTEM §4). Each conflict shows its type, the human detail, the
 * colliding window, the conflicting request ids, and a requested/available
 * meter for ASSET_OVERALLOCATED.
 */
export function ConflictBanner({ conflicts, actions }: { conflicts: Conflict[]; actions?: React.ReactNode }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  if (!conflicts.length) return null

  return (
    <div className="rounded-lg border border-danger-subtle bg-danger-subtle p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="flex flex-1 flex-col gap-3">
          <h3 className="text-[15px] font-[600] text-danger">{t('conflict.title')}</h3>
          <ul className="flex flex-col gap-3">
            {conflicts.map((c, i) => (
              <li key={i} className="flex flex-col gap-1.5 border-l-2 border-danger/40 pl-3">
                <span className="text-[13px] font-[550] text-text-primary">{t(`conflict.${c.type}`)}</span>
                <span className="text-[13px] text-text-secondary">{c.detail}</span>
                <span className="font-mono text-[12px] text-text-tertiary">{formatDateRange(c.window.start, c.window.end, locale)}</span>
                {c.conflictingRequestIds?.length ? (
                  <span className="font-mono text-[12px] text-text-tertiary">↳ {c.conflictingRequestIds.join(', ')}</span>
                ) : null}
                {c.type === 'ASSET_OVERALLOCATED' && typeof c.available === 'number' && typeof c.requested === 'number' ? (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
                      <div className="h-full rounded-pill bg-danger" style={{ width: `${Math.min(100, (c.requested / Math.max(1, c.requested)) * 100)}%` }} />
                    </div>
                    <span className="font-mono text-[12px] tabular-nums text-text-secondary">
                      {t('conflict.requested')} {c.requested} · {t('conflict.available')} {c.available}
                    </span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {actions ? <div className="flex gap-2 pt-1">{actions}</div> : null}
        </div>
      </div>
    </div>
  )
}
