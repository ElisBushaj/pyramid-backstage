import { Fragment } from 'react'
import { cn } from '@/lib/cn'

/**
 * PageHeader — §3.13. Breadcrumb · title · single primary action · filters row.
 *
 * `breadcrumb` is a trail of segments ("Pipeline / Requests"): 13px tertiary, the
 * last segment promoted to secondary, sat above the title. Title is 24/600/-0.01em
 * with a 14px secondary subtitle; the primary action sits right of the title row.
 * The filters slot (segmented control + search) lives below.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  actions,
  filters,
  children,
  className,
}: {
  title: string
  subtitle?: string
  breadcrumb?: string[]
  actions?: React.ReactNode
  filters?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav
          aria-label="Breadcrumb"
          className="-mb-2 flex flex-wrap items-center gap-2 text-[13px] text-text-tertiary"
        >
          {breadcrumb.map((segment, i) => {
            const last = i === breadcrumb.length - 1
            return (
              <Fragment key={`${segment}-${i}`}>
                {i > 0 ? (
                  <span aria-hidden className="text-text-tertiary">
                    /
                  </span>
                ) : null}
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(last && 'text-text-secondary')}
                >
                  {segment}
                </span>
              </Fragment>
            )
          })}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[24px] font-[600] tracking-[-0.01em] text-text-primary">{title}</h1>
          {subtitle ? <p className="text-[14px] text-text-secondary">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2.5">{actions}</div> : null}
      </div>
      {filters ? <div className="flex flex-wrap items-center gap-2.5">{filters}</div> : null}
      {children}
    </header>
  )
}
