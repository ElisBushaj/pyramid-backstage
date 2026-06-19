import { forwardRef } from 'react'
import * as RTabs from '@radix-ui/react-tabs'
import { cn } from '@/lib/cn'

/**
 * Tabs — §2.11. An underline tab strip on Radix Tabs. The list is a flex row
 * (gap-6) sitting on a hairline bottom border; each trigger carries a 2px
 * transparent bottom border that, when active, fills to --text-primary while
 * the label goes 400 → 600 and tertiary → primary. Pure underline emphasis —
 * no pill, no background.
 */

export const Tabs = RTabs.Root

export const TabsList = forwardRef<
  React.ElementRef<typeof RTabs.List>,
  React.ComponentPropsWithoutRef<typeof RTabs.List>
>(({ className, ...props }, ref) => (
  <RTabs.List
    ref={ref}
    className={cn('flex gap-6 border-b border-border-subtle', className)}
    {...props}
  />
))
TabsList.displayName = 'TabsList'

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof RTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RTabs.Trigger
    ref={ref}
    className={cn(
      'border-b-2 border-transparent px-0.5 py-2.5 text-[14px] font-[400] text-text-tertiary outline-none transition-colors duration-micro ease-std hover:text-text-secondary focus-visible:outline-none focus-visible:shadow-ring-medium disabled:cursor-not-allowed disabled:text-text-disabled data-[state=active]:border-text-primary data-[state=active]:font-[600] data-[state=active]:text-text-primary',
      className,
    )}
    {...props}
  />
))
TabsTrigger.displayName = 'TabsTrigger'

export const TabsContent = forwardRef<
  React.ElementRef<typeof RTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RTabs.Content>
>(({ className, ...props }, ref) => (
  <RTabs.Content
    ref={ref}
    className={cn('outline-none focus-visible:outline-none', className)}
    {...props}
  />
))
TabsContent.displayName = 'TabsContent'
