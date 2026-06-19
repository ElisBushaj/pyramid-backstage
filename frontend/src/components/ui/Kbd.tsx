import { cn } from '@/lib/cn'

/**
 * Kbd — §2.15. A keycap: 22px tall, 7px x-pad, mono 12px on --surface-subtle with a
 * --border-strong outline and a 1px bottom-edge shadow (#D7DBE0) for key depth.
 */
export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[22px] items-center rounded-[5px] border border-border-strong bg-surface-subtle px-[7px] font-mono text-[12px] text-text-secondary shadow-[0_1px_0_#D7DBE0]',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}
