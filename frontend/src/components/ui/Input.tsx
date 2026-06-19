import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const base =
  'w-full rounded-sm border bg-surface px-3 text-[14px] text-text-primary placeholder:text-text-tertiary transition-colors duration-micro focus-visible:outline-2 focus-visible:outline-border-focus focus-visible:outline-offset-0 disabled:opacity-50'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input ref={ref} className={cn(base, 'h-9', invalid ? 'border-danger' : 'border-border-subtle hover:border-border-strong', className)} aria-invalid={invalid} {...props} />
))
Input.displayName = 'Input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-20 py-2', invalid ? 'border-danger' : 'border-border-subtle hover:border-border-strong', className)} aria-invalid={invalid} {...props} />
))
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <select ref={ref} className={cn(base, 'h-9 appearance-none pr-8', invalid ? 'border-danger' : 'border-border-subtle hover:border-border-strong', className)} {...props} />
  ),
)
Select.displayName = 'Select'
