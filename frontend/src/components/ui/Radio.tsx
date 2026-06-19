import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Radio — §2.5. Native <input type="radio"> (no Radix dep), styled with
 * appearance-none. 18×18 pill, --border-strong ring. When checked the ring
 * thickens to 5px in --accent — the thick border itself forms the dot, so no
 * inner pseudo-element is needed. Focus is the medium accent ring
 * (--ring-medium, .30). Disabled is a sunken fill + subtle border.
 */
export const Radio = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="radio"
    className={cn(
      'size-[18px] shrink-0 appearance-none rounded-pill border border-border-strong bg-surface outline-none transition-[border-color,box-shadow] duration-micro ease-std focus-visible:outline-none focus-visible:shadow-ring-medium',
      'checked:border-[5px] checked:border-accent',
      'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-sunken',
      className,
    )}
    {...props}
  />
))
Radio.displayName = 'Radio'

/**
 * RadioGroup — thin convenience wrapper. Lays radios in a column and wires a
 * shared `name` so native single-select behaviour works without per-input
 * plumbing. Pass radios (or label rows) as children.
 */
export interface RadioGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  name?: string
}

export function RadioGroup({ className, ...props }: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}
