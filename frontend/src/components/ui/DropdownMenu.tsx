import { forwardRef } from 'react'
import * as RDM from '@radix-ui/react-dropdown-menu'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * DropdownMenu — §2.9. Radix dropdown menu in the command-center idiom.
 * Content: rounded-md (10px), overlay shadow, 6px pad, min-w 200. Items are
 * 14px primary text with a tertiary leading icon and a sunken hover fill; the
 * `destructive` variant tints text + icon danger. A separator is a hairline
 * border-subtle rule. Overlays via Portal on the dropdown z-tier.
 */

export const DropdownMenu = RDM.Root
export const DropdownMenuTrigger = RDM.Trigger
export const DropdownMenuGroup = RDM.Group

export const DropdownMenuContent = forwardRef<HTMLDivElement, RDM.DropdownMenuContentProps>(
  ({ className, sideOffset = 6, children, ...props }, ref) => (
    <RDM.Portal>
      <RDM.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-dropdown min-w-[200px] rounded-md bg-surface p-1.5 shadow-overlay outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in',
          className,
        )}
        {...props}
      >
        {children}
      </RDM.Content>
    </RDM.Portal>
  ),
)
DropdownMenuContent.displayName = 'DropdownMenuContent'

const item = cva(
  'flex cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[14px] outline-none transition-colors duration-micro ease-std [&>svg]:size-4 [&>svg]:shrink-0 data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled',
  {
    variants: {
      variant: {
        default:
          'text-text-primary [&>svg]:text-text-tertiary data-[highlighted]:bg-surface-sunken',
        destructive:
          'text-danger [&>svg]:text-danger data-[highlighted]:bg-danger-subtle',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface DropdownMenuItemProps
  extends RDM.DropdownMenuItemProps,
    VariantProps<typeof item> {}

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, variant, ...props }, ref) => (
    <RDM.Item ref={ref} className={cn(item({ variant }), className)} {...props} />
  ),
)
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, RDM.DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <RDM.Separator ref={ref} className={cn('my-1.5 h-px bg-border-subtle', className)} {...props} />
  ),
)
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

export const DropdownMenuLabel = forwardRef<HTMLDivElement, RDM.DropdownMenuLabelProps>(
  ({ className, ...props }, ref) => (
    <RDM.Label
      ref={ref}
      className={cn('px-2.5 py-1.5 text-[11px] font-[550] uppercase tracking-[0.03em] text-text-tertiary', className)}
      {...props}
    />
  ),
)
DropdownMenuLabel.displayName = 'DropdownMenuLabel'
