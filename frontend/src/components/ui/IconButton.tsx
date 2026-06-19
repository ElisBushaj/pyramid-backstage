import { forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * IconButton — §2.2. Square icon-only control. Control radius 8px, secondary
 * icon ink. `ghost` is transparent → sunken hover; `subtle` carries a standing
 * sunken fill. Focus is a 3px accent ring (--ring-medium, .30) plus a focus
 * border, never the global outline. Disabled drops the icon to --text-disabled.
 * An `aria-label` is required since there is no visible text.
 */
const iconButton = cva(
  'inline-flex shrink-0 items-center justify-center rounded-control border border-transparent text-text-secondary outline-none transition-[background-color,border-color,box-shadow] duration-micro ease-std focus-visible:border-border-focus focus-visible:shadow-ring-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:pointer-events-none disabled:text-text-disabled',
  {
    variants: {
      variant: {
        ghost: 'bg-transparent hover:bg-surface-sunken',
        subtle: 'bg-surface-sunken hover:bg-surface-sunken',
      },
      size: {
        sm: 'size-[28px]',
        md: 'size-[34px]',
      },
    },
    defaultVariants: { variant: 'ghost', size: 'md' },
  },
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButton> {
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(iconButton({ variant, size }), className)} {...props} />
  ),
)
IconButton.displayName = 'IconButton'
