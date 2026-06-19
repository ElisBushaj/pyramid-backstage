import type { SpaceWithAvailability } from '@/api/types/spaces'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatMinor } from '@/lib/money'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'

export function SpaceCard({ space, layout }: { space: SpaceWithAvailability; layout?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const cap = layout ? space.capacities[layout] : Math.max(0, ...Object.values(space.capacities))
  return (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[16px] font-[600] text-text-primary">{space.name}</h3>
          <p className="text-[12px] text-text-tertiary">{t('spaces.floor')} {space.floor} · {space.kind}</p>
        </div>
        {space.available !== undefined ? (
          <span className={cn('flex items-center gap-1.5 text-[12px] font-[550]', space.available ? 'text-success' : 'text-danger')}>
            <span className="size-1.5 rounded-pill bg-current" />
            {space.available ? t('spaces.available') : t('spaces.unavailable')}
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-[600] tabular-nums leading-none text-text-primary">{cap}</span>
        <span className="text-[12px] text-text-tertiary">{layout ?? t('spaces.capacity')}</span>
      </div>
      {space.features.length ? (
        <div className="flex flex-wrap gap-1.5">
          {space.features.map((f) => (
            <span key={f} className="rounded-pill bg-surface-subtle px-2 py-0.5 text-[11px] text-text-secondary">{f}</span>
          ))}
        </div>
      ) : null}
      <p className="font-mono text-[13px] tabular-nums text-text-secondary">{formatMinor(space.dayRateMinor, locale)}<span className="text-text-tertiary"> / {t('spaces.dayRate').toLowerCase()}</span></p>
    </Card>
  )
}
