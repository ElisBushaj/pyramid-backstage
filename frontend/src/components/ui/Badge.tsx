import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * Badge — §2.12. Pill with a 1px translucent border in the fg tone (~15% alpha),
 * a tone-subtle fill, and the tone color as text. Weight 600 (canvas), not 550.
 * Neutral fills with --surface-sunken (#F1F3F5), not --surface-subtle.
 * `dot` renders a 6px fg-colored dot at the lead.
 */
const badge = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-[3px] text-[12px] font-[600]',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-text-tertiary border-text-tertiary/15',
        success: 'bg-success-subtle text-success border-success/15',
        warning: 'bg-warning-subtle text-warning border-warning/15',
        danger: 'bg-danger-subtle text-danger border-danger/15',
        info: 'bg-info-subtle text-info border-info/15',
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
