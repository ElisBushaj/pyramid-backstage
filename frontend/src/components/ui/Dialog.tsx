import * as RD from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * Dialog — §2.7. Centered modal over a 35% ink scrim (no blur). The panel is a
 * bg-surface card, rounded-lg, p-6, shadow-overlay, width by `size`
 * (sm 440 / md 520 / lg 640). Enter/exit animate via Radix data-[state]
 * (opacity + a subtle scale) — transition-based, so no keyframe dependency.
 *
 * `DialogContent` keeps the generic titled-with-close-X header for everyday
 * dialogs. `ConfirmDialog` is the destructive layout from the canvas: a leading
 * danger icon chip + inline title (no header border, no top-right X), a
 * secondary body paragraph, and an end-aligned Cancel + danger action footer.
 */

export const Dialog = RD.Root
export const DialogTrigger = RD.Trigger
export const DialogClose = RD.Close
export const DialogTitle = RD.Title
export const DialogDescription = RD.Description

const content = cva(
  'fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-6 shadow-overlay outline-none transition-[opacity,transform] duration-std ease-std data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97] data-[state=open]:opacity-100 data-[state=open]:scale-100',
  {
    variants: {
      size: {
        sm: 'w-[min(440px,calc(100vw-2rem))]',
        md: 'w-[min(520px,calc(100vw-2rem))]',
        lg: 'w-[min(640px,calc(100vw-2rem))]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

function DialogOverlay({ className }: { className?: string }) {
  return (
    <RD.Overlay
      className={cn(
        'fixed inset-0 z-modal bg-[rgba(11,13,18,0.35)] transition-opacity duration-std ease-std data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
        className,
      )}
    />
  )
}

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof RD.Content>,
    VariantProps<typeof content> {
  title: string
}

export function DialogContent({ className, title, size, children, ...props }: DialogContentProps) {
  return (
    <RD.Portal>
      <DialogOverlay />
      <RD.Content className={cn(content({ size }), 'p-0', className)} {...props}>
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-3.5">
          <RD.Title className="text-[16px] font-[600] text-text-primary">{title}</RD.Title>
          <RD.Close
            aria-label="Close"
            className="rounded-sm p-1 text-text-tertiary outline-none transition-colors duration-micro ease-std hover:bg-surface-subtle hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-medium"
          >
            <X className="size-4" />
          </RD.Close>
        </div>
        <div className="px-6 py-4">{children}</div>
      </RD.Content>
    </RD.Portal>
  )
}

export interface ConfirmDialogProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RD.Content>, 'title'>,
    VariantProps<typeof content> {
  title?: string
  description?: React.ReactNode
  cancelLabel?: string
  confirmLabel?: string
  onConfirm?: () => void
  loading?: boolean
}

export function ConfirmDialog({
  className,
  size = 'sm',
  title = 'Reject this request?',
  description = 'The organizer will be notified and any held reservations released. This is recorded in the audit log.',
  cancelLabel = 'Cancel',
  confirmLabel = 'Reject request',
  onConfirm,
  loading,
  ...props
}: ConfirmDialogProps) {
  return (
    <RD.Portal>
      <DialogOverlay />
      <RD.Content className={cn(content({ size }), className)} {...props}>
        <div className="mb-2.5 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-control bg-danger-subtle text-danger"
          >
            <AlertTriangle className="size-4" />
          </span>
          <RD.Title className="text-[16px] font-[600] text-text-primary">{title}</RD.Title>
        </div>
        <RD.Description asChild>
          <div className="mb-5 text-[14px] leading-[21px] text-text-secondary">{description}</div>
        </RD.Description>
        <div className="flex justify-end gap-2.5">
          <RD.Close asChild>
            <Button variant="secondary" size="md">
              {cancelLabel}
            </Button>
          </RD.Close>
          <Button variant="danger" size="md" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </RD.Content>
    </RD.Portal>
  )
}
