import { forwardRef } from 'react'
import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Select — §2.4. Radix Select with a styled command-center trigger.
 * Closed trigger: h-38 control-radius, border-strong, justify-between with a
 * tertiary chevron. Open panel overlays via Portal: rounded-md, border-subtle,
 * overlay shadow, 6px pad. Option rows are secondary text; the selected row is
 * primary/550 on accent-muted with a trailing check.
 */

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  name?: string
  className?: string
  /** Trigger width — canvas closed trigger is 220px. */
  triggerClassName?: string
  'aria-label'?: string
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      options,
      placeholder = 'Select…',
      disabled,
      name,
      className,
      triggerClassName,
      'aria-label': ariaLabel,
    },
    ref,
  ) => (
    <RS.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange} disabled={disabled} name={name}>
      <RS.Trigger
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          'flex h-[38px] w-[220px] items-center justify-between gap-2 rounded-control border border-border-strong bg-surface px-3 text-[14px] text-text-primary outline-none transition-[border-color,box-shadow] duration-micro ease-std',
          'data-[placeholder]:text-text-tertiary',
          'focus-visible:border-border-focus focus-visible:shadow-ring-soft focus-visible:outline-none',
          'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-text-disabled',
          triggerClassName,
          className,
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon asChild>
          <ChevronDown size={14} className="shrink-0 text-text-tertiary" aria-hidden />
        </RS.Icon>
      </RS.Trigger>

      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-dropdown min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-border-subtle bg-surface p-1.5 shadow-overlay',
            'data-[state=open]:animate-in data-[state=open]:fade-in',
          )}
        >
          <RS.Viewport>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  ),
)
Select.displayName = 'Select'

const SelectItem = forwardRef<HTMLDivElement, RS.SelectItemProps>(({ className, children, ...props }, ref) => (
  <RS.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-[14px] text-text-secondary outline-none',
      'data-[highlighted]:bg-surface-sunken data-[highlighted]:text-text-primary',
      'data-[state=checked]:bg-accent-muted data-[state=checked]:font-[550] data-[state=checked]:text-text-primary',
      'data-[disabled]:cursor-not-allowed data-[disabled]:text-text-disabled',
      className,
    )}
    {...props}
  >
    <RS.ItemText>{children}</RS.ItemText>
    <RS.ItemIndicator asChild>
      <Check size={14} className="shrink-0 text-text-primary" aria-hidden />
    </RS.ItemIndicator>
  </RS.Item>
))
SelectItem.displayName = 'SelectItem'
