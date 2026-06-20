import { useState } from 'react'
import { useParams } from 'react-router'
import { Pencil, ArrowRight, MapPin } from 'lucide-react'
import { useAssets, useAssetMovements, useMe, useUpdateAsset } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AssetQr } from '@/components/command/AssetQr'
import type { AssetInput } from '@/api/types/assets'

export default function AssetDetail() {
  const { id } = useParams()
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const assetsQuery = useAssets({})
  const me = useMe().data
  const asset = assetsQuery.data?.find((a) => a.id === id)
  const movements = useAssetMovements(id).data ?? []
  const update = useUpdateAsset(id ?? '')

  const canEdit = me ? ['OPS', 'MANAGER', 'ADMIN'].includes(me.role) : false
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<AssetInput>>({})

  if (assetsQuery.isLoading) {
    return (
      <div>
        <Skeleton className="h-7 w-[240px]" />
        <div className="mt-6 flex flex-wrap gap-3.5">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[78px] min-w-[120px] flex-1 rounded-md" />)}
        </div>
      </div>
    )
  }
  if (assetsQuery.isError || !asset) {
    return <ErrorState title={t('inventory.loadError')} message={t('error.generic')} onRetry={() => assetsQuery.refetch()} retryLabel={t('ui.common.retry')} />
  }

  const total = asset.totalQuantity
  const available = asset.availableQuantity ?? total
  const held = Math.max(0, total - available)
  const checkedOut = asset.checkedOutQuantity ?? 0
  const fmtAt = (iso: string) => new Intl.DateTimeFormat(locale === 'al' ? 'sq-AL' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  function saveEdit() {
    update.mutate(draft, { onSuccess: () => setEditing(false) })
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[t('nav.resources'), t('nav.inventory'), asset.name]}
        title={asset.name}
        subtitle={editing ? `${t('spaces.editMode')} · ${me?.role}` : asset.location}
        actions={
          editing ? (
            <div className="flex items-center gap-2.5">
              <span className="rounded-pill bg-accent-muted px-2.5 py-1 text-[11px] font-[600] uppercase text-accent">{t('spaces.editMode')}</span>
              <Button variant="secondary" size="sm" onClick={() => { setEditing(false); setDraft({}) }}>{t('ui.common.cancel')}</Button>
              <Button size="sm" loading={update.isPending} onClick={saveEdit}>{t('spaces.save')}</Button>
            </div>
          ) : canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> {t('inventory.edit')}
            </Button>
          ) : null
        }
      />

      {/* Stat tiles */}
      <div className="mt-6 flex flex-wrap gap-3.5">
        <Stat label={t('inventory.total')} value={total} />
        <Stat label={t('inventory.availableWindow')} value={available} tone={available === 0 ? 'danger' : available <= total * 0.25 ? 'warning' : 'default'} />
        <Stat label={t('inventory.held')} value={held} className="text-[#E0A300]" />
        <Stat label={t('inventory.checkedOut')} value={checkedOut} tone={checkedOut > 0 ? 'warning' : 'default'} />
      </div>

      <div className="mt-5 flex flex-wrap gap-5">
        {/* Details */}
        <section className="min-w-[280px] flex-1 rounded-lg border border-border-subtle p-5">
          <h2 className="mb-2 text-[15px] font-[600] text-text-primary">{t('inventory.details')}</h2>
          <Field label={t('inventory.type')} value={<span className="capitalize">{asset.type.toLowerCase().replace('_', ' ')}</span>} />
          <Field label={t('inventory.location')} value={asset.location} />
          <Field label={t('inventory.totalUnits')} value={String(total)} />
          <div className="flex items-center justify-between py-[11px]">
            <span className="text-[14px] text-text-secondary">{t('audit.action')}</span>
            <StatusBadge status={asset.status} />
          </div>
        </section>

        {/* F16 — QR tag + live movement ledger. */}
        <section className="min-w-[320px] flex-1 rounded-lg border border-border-subtle p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-[600] text-text-primary">{t('inventory.movements')}</h2>
              <p className="mt-1 flex items-center gap-1 text-[13px] text-text-secondary"><MapPin className="size-3.5" /> {t('inventory.liveLocation')}: <span className="font-[550] text-text-primary">{asset.location}</span></p>
            </div>
            <AssetQr value={asset.id} label={asset.id} size={104} />
          </div>

          <div className="mt-4">
            {movements.length === 0 ? (
              <EmptyState title={t('inventory.noMovements')} message={`${available}/${total} ${t('inventory.available').toLowerCase()}`} />
            ) : (
              <ol className="relative space-y-3 border-l border-border-subtle pl-4">
                {movements.map((m) => (
                  <li key={m.id} className="relative">
                    <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-accent" />
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-[11px] font-[600] uppercase text-text-secondary">{t(`scanner.${m.action === 'CHECK_OUT' ? 'checkOut' : m.action === 'CHECK_IN' ? 'checkIn' : 'relocate'}`)}</span>
                      <span className="font-mono font-[600] tabular-nums text-text-primary">{m.quantity}</span>
                      <span className="flex items-center gap-1 text-text-secondary">
                        {m.fromLocation && <>{m.fromLocation} <ArrowRight className="size-3" /></>}
                        <span className="font-[550] text-text-primary">{m.toLocation}</span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">{fmtAt(m.at)}{m.note ? ` · ${m.note}` : ''}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'default', className }: { label: string; value: number; tone?: 'default' | 'warning' | 'danger'; className?: string }) {
  return (
    <div className="min-w-[120px] flex-1 rounded-md border border-border-subtle p-4">
      <p className="mb-2 text-[13px] text-text-secondary">{label}</p>
      <p
        className={cn(
          'font-mono text-[24px] font-[600] tabular-nums',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-text-primary',
          className,
        )}
      >
        {value}
      </p>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-[11px] last:border-0">
      <span className="text-[14px] text-text-secondary">{label}</span>
      <span className="text-[14px] font-[550] text-text-primary">{value}</span>
    </div>
  )
}
