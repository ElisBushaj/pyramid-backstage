import { cn } from '@/lib/cn'

export function PageHeader({
  title,
  subtitle,
  actions,
  filters,
  className,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  filters?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-[600] tracking-[-0.01em] text-text-primary">{title}</h1>
          {subtitle ? <p className="text-[14px] text-text-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
    </header>
  )
}
