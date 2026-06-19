import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

const button = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-[550] transition-colors duration-micro ease-std focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-text-on-accent hover:bg-accent-hover active:bg-accent-pressed',
        secondary: 'border border-border-strong bg-surface text-text-primary hover:bg-surface-subtle',
        ghost: 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary',
        danger: 'bg-danger text-text-inverted hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-4 text-[14px]',
        lg: 'h-11 px-5 text-[15px]',
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
  ({ className, variant, size, fullWidth, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp ref={ref} className={cn(button({ variant, size, fullWidth }), className)} disabled={disabled || loading} {...props}>
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'
