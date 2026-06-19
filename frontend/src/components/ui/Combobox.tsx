import { forwardRef, useMemo, useState } from 'react'
import * as RP from '@radix-ui/react-popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Combobox — §2.4. Searchable variant of Select, built on Radix Popover plus a
 * filterable list (Radix ships no combobox). Trigger mirrors Select. The open
 * panel (240px) has a search header (border-b, magnifier, input), filtered
 * option rows (selected → accent-muted + check) and a centered empty state.
 * Controlled via options / value / onChange.
 */

export interface ComboboxOption {
  value: string
  label: string
}

export interface ComboboxProps {
  value?: string
  onChange?: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  /**
   * Empty-state copy. `{query}` is replaced with the current search term.
   * Canvas default mirrors the spaces picker.
   */
  emptyMessage?: (query: string) => string
  'aria-label'?: string
}

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(
  (
    {
      value,
      onChange,
      options,
      placeholder = 'Select…',
      searchPlaceholder = 'Search…',
      disabled,
      className,
      triggerClassName,
      emptyMessage = (query) => `No spaces match “${query}”`,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')

    const selected = options.find((o) => o.value === value)

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase()
      if (!q) return options
      return options.filter((o) => o.label.toLowerCase().includes(q))
    }, [options, query])

    const select = (next: string) => {
      onChange?.(next)
      setOpen(false)
      setQuery('')
    }

    return (
      <RP.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery('')
        }}
      >
        <RP.Trigger
          ref={ref}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'flex h-[38px] w-[220px] items-center justify-between gap-2 rounded-control border border-border-strong bg-surface px-3 text-[14px] outline-none transition-[border-color,box-shadow] duration-micro ease-std',
            selected ? 'text-text-primary' : 'text-text-tertiary',
            'focus-visible:border-border-focus focus-visible:shadow-ring-soft focus-visible:outline-none',
            'data-[state=open]:border-border-focus data-[state=open]:shadow-ring-soft',
            'disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-surface-subtle disabled:text-text-disabled',
            triggerClassName,
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown size={14} className="shrink-0 text-text-tertiary" aria-hidden />
        </RP.Trigger>

        <RP.Portal>
          <RP.Content
            align="start"
            sideOffset={6}
            className={cn(
              'z-dropdown w-[240px] overflow-hidden rounded-md border border-border-subtle bg-surface p-1.5 shadow-overlay',
              'data-[state=open]:animate-in data-[state=open]:fade-in',
            )}
          >
            <div className="-mx-1.5 -mt-1.5 mb-1.5 flex items-center gap-2 border-b border-border-subtle px-2.5 py-2">
              <Search size={14} className="shrink-0 text-text-tertiary" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="px-3 py-[18px] text-center text-[13px] text-text-tertiary">
                {emptyMessage(query)}
              </div>
            ) : (
              <div role="listbox" className="flex flex-col">
                {filtered.map((opt) => {
                  const isSelected = opt.value === value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => select(opt.value)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-[14px] text-text-secondary outline-none transition-colors duration-micro ease-std',
                        'hover:bg-surface-sunken hover:text-text-primary focus-visible:bg-surface-sunken focus-visible:text-text-primary focus-visible:outline-none',
                        isSelected && 'bg-accent-muted font-[550] text-text-primary',
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected ? (
                        <Check size={14} className="shrink-0 text-text-primary" aria-hidden />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </RP.Content>
        </RP.Portal>
      </RP.Root>
    )
  },
)
Combobox.displayName = 'Combobox'
