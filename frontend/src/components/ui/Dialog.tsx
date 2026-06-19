import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export const Dialog = RD.Root
export const DialogTrigger = RD.Trigger
export const DialogClose = RD.Close

export function DialogContent({ className, title, children }: { className?: string; title: string; children: React.ReactNode }) {
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-modal bg-black/30 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in" />
      <RD.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-modal w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border-subtle bg-surface shadow-overlay',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <RD.Title className="text-[16px] font-[600] text-text-primary">{title}</RD.Title>
          <RD.Close className="rounded-sm p-1 text-text-tertiary hover:bg-surface-subtle hover:text-text-primary">
            <X className="size-4" />
          </RD.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
      </RD.Content>
    </RD.Portal>
  )
}
