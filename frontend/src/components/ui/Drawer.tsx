import * as RD from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Drawer — §2.8. A side-anchored panel built on Radix Dialog. The right
 * variant (desktop) is a full-height 320px edge panel with a left-cast
 * shadow-drawer; the bottom variant (mobile) slides up from the screen edge.
 * Enter/exit slide 280ms (duration-page) / ease-std via a translate that flips
 * on Radix's data-[state] — transition-based, so no keyframe dependency. The
 * scrim is a 30% ink wash with a matching fade.
 */

export const Drawer = RD.Root
export const DrawerTrigger = RD.Trigger
export const DrawerClose = RD.Close

const panel = cva(
  'fixed z-drawer flex flex-col gap-3.5 bg-surface p-5 outline-none transition-transform duration-page ease-std',
  {
    variants: {
      side: {
        right:
          'right-0 top-0 h-full w-80 shadow-[-16px_0_40px_-12px_rgba(11,13,18,0.18)] data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
        bottom:
          'inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-lg shadow-[0_-16px_40px_-12px_rgba(11,13,18,0.18)] data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
      },
    },
    defaultVariants: { side: 'right' },
  },
)

export interface DrawerContentProps
  extends React.ComponentPropsWithoutRef<typeof RD.Content>,
    VariantProps<typeof panel> {
  title?: string
  /** Render the default close-X in the header. */
  showClose?: boolean
}

export function DrawerContent({
  className,
  side = 'right',
  title,
  showClose = true,
  children,
  ...props
}: DrawerContentProps) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-drawer bg-[rgba(11,13,18,0.3)] transition-opacity duration-page ease-std data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
      <RD.Content className={cn(panel({ side }), className)} {...props}>
        {(title || showClose) && (
          <div className="flex items-center justify-between">
            {title ? (
              <RD.Title className="text-[16px] font-[600] text-text-primary">{title}</RD.Title>
            ) : (
              <RD.Title className="sr-only">Drawer</RD.Title>
            )}
            {showClose && (
              <RD.Close
                aria-label="Close"
                className="-mr-1 rounded-sm p-1 text-text-tertiary outline-none transition-colors duration-micro ease-std hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-medium"
              >
                <X className="size-4" />
              </RD.Close>
            )}
          </div>
        )}
        {children}
      </RD.Content>
    </RD.Portal>
  )
}

export const DrawerTitle = RD.Title
export const DrawerDescription = RD.Description
