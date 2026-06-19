import { cn } from '@/lib/cn'

/**
 * FormField — §2.6. Label is 14px / weight 550 / --text-primary (NOT 13px
 * secondary). Hint and error are 13px (tertiary / danger). Field stacks
 * label → control → message with a 7px gap.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-[7px]', className)}>
      <label htmlFor={htmlFor} className="text-[14px] font-[550] text-text-primary">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-[13px] text-danger">{error}</span>
      ) : hint ? (
        <span className="text-[13px] text-text-tertiary">{hint}</span>
      ) : null}
    </div>
  )
}
