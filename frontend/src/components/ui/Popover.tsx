import { forwardRef } from 'react'
import * as RP from '@radix-ui/react-popover'
import { cn } from '@/lib/cn'

/**
 * Popover — §2.9. Radix Popover with a command-center floating card.
 * Content: w-220, rounded-md (10px), overlay shadow, 14px pad. A title slot
 * (13px/600) sits above a secondary body (13px, 19px line-height). Overlays via
 * Portal with the dropdown z-tier and the standard open fade.
 */

export const Popover = RP.Root
export const PopoverTrigger = RP.Trigger
export const PopoverAnchor = RP.Anchor

export const PopoverContent = forwardRef<HTMLDivElement, RP.PopoverContentProps>(
  ({ className, sideOffset = 6, children, ...props }, ref) => (
    <RP.Portal>
      <RP.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-dropdown w-[220px] rounded-md bg-surface p-3.5 text-[13px] text-text-primary shadow-overlay outline-none',
          'data-[state=open]:animate-in data-[state=open]:fade-in',
          className,
        )}
        {...props}
      >
        {children}
      </RP.Content>
    </RP.Portal>
  ),
)
PopoverContent.displayName = 'PopoverContent'

export function PopoverTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('mb-1.5 text-[13px] font-[600] text-text-primary', className)}>{children}</div>
}

export function PopoverBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('text-[13px] leading-[19px] text-text-secondary', className)}>{children}</div>
}
