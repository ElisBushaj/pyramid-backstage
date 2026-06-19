import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * Button — §2.1. Calm command-center button. 4 variants × full state set.
 * Control radius 8px, weight 550, 7px icon gap. Focus is a 3px accent ring
 * (--ring-strong), never the global outline. Disabled is an explicit sunken
 * fill + --text-disabled, not an opacity fade.
 */
const button = cva(
  'relative inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-control border border-transparent font-[550] transition-[background-color,border-color,box-shadow] duration-micro ease-std outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-text-on-accent hover:bg-accent-hover active:bg-accent-pressed focus-visible:shadow-ring-strong disabled:bg-surface-sunken disabled:text-text-disabled',
        secondary:
          'border-border-strong bg-surface text-text-primary hover:bg-surface-subtle active:bg-surface-sunken focus-visible:border-border-focus focus-visible:shadow-ring-strong disabled:bg-surface disabled:border-border-subtle disabled:text-text-disabled',
        ghost:
          'text-text-primary hover:bg-surface-sunken active:bg-border-subtle focus-visible:border-border-focus focus-visible:shadow-ring-strong disabled:bg-surface disabled:text-text-disabled',
        danger:
          'bg-danger text-text-inverted hover:bg-danger-hover active:bg-danger-pressed focus-visible:shadow-ring-strong disabled:bg-surface-sunken disabled:text-text-disabled',
      },
      size: {
        sm: 'h-7 px-3 text-[13px]',
        md: 'h-[34px] px-3.5 text-[14px]',
        lg: 'h-10 px-[18px] text-[14px]',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size, fullWidth, asChild, loading, disabled, children, ...props }, ref) => {
    const classes = cn(button({ variant, size, fullWidth }), className)
    if (asChild) {
      // asChild renders a single arbitrary element (e.g. <Link>) — no spinner.
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      )
    }
    const light = variant === 'secondary' || variant === 'ghost'
    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? (
          <span
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 rounded-pill border-2 [animation:spin-ring_700ms_linear_infinite]',
              light ? 'border-text-tertiary/40 border-t-text-tertiary' : 'border-white/40 border-t-white',
            )}
          />
        ) : null}
        {children}
      </button>
    )
  },
)
Button.displayName = 'Button'
