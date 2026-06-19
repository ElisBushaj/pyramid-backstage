import { forwardRef } from 'react'
import * as RC from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Checkbox — §2.5. 18×18 control, 5px radius. Checked/indeterminate fill with
 * --accent + a white mark. Focus is the medium accent ring (--ring-medium,
 * .30), never the global outline. Disabled is a sunken fill + subtle border.
 *
 * `indeterminate` is surfaced as a prop and forwarded to Radix `checked`
 * (which accepts the 'indeterminate' sentinel); when set it wins over `checked`.
 */
export interface CheckboxProps
  extends Omit<RC.CheckboxProps, 'checked'> {
  checked?: boolean
  indeterminate?: boolean
}

export const Checkbox = forwardRef<
  React.ComponentRef<typeof RC.Root>,
  CheckboxProps
>(({ className, checked, indeterminate, ...props }, ref) => (
  <RC.Root
    ref={ref}
    checked={indeterminate ? 'indeterminate' : checked}
    className={cn(
      'group inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface outline-none transition-[background-color,border-color,box-shadow] duration-micro ease-std focus-visible:outline-none focus-visible:shadow-ring-medium',
      'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
      'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
      'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-sunken',
      className,
    )}
    {...props}
  >
    <RC.Indicator className="inline-flex items-center justify-center text-text-inverted">
      {indeterminate ? (
        <span className="h-0.5 w-[9px] rounded-[1px] bg-current" />
      ) : (
        <Check className="size-[11px] [stroke-width:1.8]" />
      )}
    </RC.Indicator>
  </RC.Root>
))
Checkbox.displayName = 'Checkbox'
