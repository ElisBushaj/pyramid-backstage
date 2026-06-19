import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[12px] font-[550] tracking-[0.01em]',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-subtle text-text-secondary',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
        info: 'bg-info-subtle text-info',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeTone = NonNullable<VariantProps<typeof badge>['tone']>

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  dot?: boolean
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badge({ tone }), className)} {...props}>
      {dot ? <span className="size-1.5 rounded-pill bg-current" aria-hidden /> : null}
      {children}
    </span>
  )
}
