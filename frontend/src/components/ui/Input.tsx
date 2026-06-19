import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * Input / Textarea / Select — §2.3. 38px controls, --radius-control (8px),
 * default border --border-strong (NOT subtle). Focus is a soft 3px accent ring
 * (--ring-soft, .18) plus a --border-focus edge, never the global outline.
 * Disabled is an explicit subtle fill + --text-disabled, not an opacity fade.
 */
const fieldBorder = (invalid?: boolean) =>
  invalid
    ? 'border-danger'
    : 'border-border-strong focus-visible:border-border-focus focus-visible:shadow-ring-soft disabled:border-border-subtle'

const fieldBase =
  'w-full rounded-control border bg-surface text-[14px] text-text-primary placeholder:text-text-tertiary transition-colors duration-micro ease-std focus-visible:outline-none disabled:bg-surface-subtle disabled:text-text-disabled'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  invalid?: boolean
  /** Leading affix (e.g. `#`) — tertiary, 14px. Renders inside the bordered control. */
  prefix?: React.ReactNode
  /** Trailing affix (e.g. `pax`) — tertiary, 13px mono. Renders inside the bordered control. */
  suffix?: React.ReactNode
  /** Class applied to the outer wrapper when prefix/suffix are present. */
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, prefix, suffix, wrapperClassName, disabled, ...props }, ref) => {
    if (prefix == null && suffix == null) {
      return (
        <input
          ref={ref}
          className={cn(fieldBase, 'h-[38px] px-3', fieldBorder(invalid), className)}
          aria-invalid={invalid}
          disabled={disabled}
          {...props}
        />
      )
    }
    return (
      <div
        className={cn(
          fieldBase,
          'flex h-[38px] items-center gap-2 px-3 focus-within:border-border-focus focus-within:shadow-ring-soft',
          invalid ? 'border-danger' : 'border-border-strong',
          disabled && 'bg-surface-subtle border-border-subtle',
          wrapperClassName,
        )}
      >
        {prefix != null ? (
          <span className="shrink-0 text-[14px] text-text-tertiary">{prefix}</span>
        ) : null}
        <input
          ref={ref}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-[14px] text-text-primary placeholder:text-text-tertiary outline-none focus-visible:outline-none disabled:text-text-disabled',
            className,
          )}
          aria-invalid={invalid}
          disabled={disabled}
          {...props}
        />
        {suffix != null ? (
          <span className="shrink-0 font-mono text-[13px] text-text-tertiary">{suffix}</span>
        ) : null}
      </div>
    )
  },
)
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(fieldBase, 'min-h-20 px-3 py-2.5 leading-[21px]', fieldBorder(invalid), className)}
      aria-invalid={invalid}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(fieldBase, 'h-[38px] appearance-none px-3 pr-8', fieldBorder(invalid), className)}
    aria-invalid={invalid}
    {...props}
  />
))
Select.displayName = 'Select'
