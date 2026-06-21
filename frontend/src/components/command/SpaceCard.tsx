import { cn } from '@/lib/cn'
import { useT } from '@/i18n/useT'
import { Button } from '@/components/ui/Button'

/**
 * SpaceCard — §3.5. Capacity-for-requested-layout (big tabular) · feature chips ·
 * day rate · availability dot. free → success "Available", held → warning "Held".
 */
export interface SpaceCardProps {
  name: string
  floor: string
  capacity: number | string
  layout: string
  features: string[]
  rate: string
  availability: 'free' | 'held'
  onSelect?: () => void
}

export function SpaceCard({
  name,
  floor,
  capacity,
  layout,
  features,
  rate,
  availability,
  onSelect,
}: SpaceCardProps) {
  const t = useT()
  const held = availability === 'held'
  return (
    <div
      className={cn(
        'w-[280px] rounded-lg border border-border-subtle bg-surface p-[18px] shadow-raised transition-shadow hover:shadow-md',
        onSelect && 'cursor-pointer',
      )}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect()
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-[600] text-text-primary">{name}</h3>
          <p className="text-[13px] text-text-tertiary">{floor}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[12px] font-[600]',
            held ? 'text-warning' : 'text-success',
          )}
        >
          <span className="size-2 rounded-pill bg-current" aria-hidden />
          {held ? t('spaces.held') : t('spaces.available')}
        </span>
      </div>

      <div className="my-4 border-b border-border-subtle pb-3.5">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[30px] font-[600] leading-none tabular-nums tracking-[-0.02em] text-text-primary">
            {capacity}
          </span>
          <span className="text-[13px] text-text-tertiary">{layout}</span>
        </div>
        <p className="mt-0.5 text-[12px] text-text-tertiary">{t('spaces.capacityForLayout')}</p>
      </div>

      {features.length ? (
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          {features.map((f) => (
            <span
              key={f}
              className="rounded-pill bg-surface-sunken px-[9px] py-[3px] text-[12px] text-text-secondary"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="font-mono text-[14px] font-[600] tabular-nums text-text-primary">
          {rate}
          <span className="font-sans text-[12px] font-normal text-text-tertiary"> {t('spaces.perDay')}</span>
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onSelect?.()
          }}
        >
          {t('spaces.select')}
        </Button>
      </div>
    </div>
  )
}
