import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * SegmentedControl — §2.11. A compact, mutually-exclusive choice track: a
 * sunken inline-flex rail (p-3px) holding equal-weight segments. The active
 * segment lifts onto a bg-surface chip with a hairline drop shadow and goes
 * text-primary; the rest stay text-secondary on a transparent ground. Controlled
 * — pass `value`, `onChange`, and the `options`.
 *
 * Custom (no Radix): a native button row gives the cleanest controlled API for
 * this small, app-driven control.
 */

export interface SegmentedOption<T extends string = string> {
  label: string
  value: T
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group. */
  'aria-label'?: string
}

function SegmentedControlInner<T extends string = string>(
  { className, options, value, onChange, ...props }: SegmentedControlProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  return (
    <div
      ref={ref}
      role="radiogroup"
      className={cn(
        'inline-flex gap-0.5 rounded-control bg-surface-sunken p-[3px]',
        className,
      )}
      {...props}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-sm px-4 py-1.5 text-[13px] font-[550] outline-none transition-[background-color,color,box-shadow] duration-micro ease-std focus-visible:outline-none focus-visible:shadow-ring-medium disabled:cursor-not-allowed disabled:text-text-disabled',
              active
                ? 'bg-surface text-text-primary shadow-[0_1px_2px_rgba(11,13,18,0.08)]'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export const SegmentedControl = forwardRef(SegmentedControlInner) as <T extends string = string>(
  props: SegmentedControlProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> },
) => React.ReactElement
