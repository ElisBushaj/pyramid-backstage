import { forwardRef } from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

/**
 * Avatar — §2.13. Round, with a subtle inset ring (inset 0 0 0 1px rgba(11,13,18,.06)).
 * Initials fallback sits on #E3E7EC (no token — a one-off canvas gray) in weight 600
 * --text-secondary. Font-size is size×0.4 so initials scale with the circle.
 */
const avatar = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-pill shadow-[inset_0_0_0_1px_rgba(11,13,18,0.06)]',
  {
    variants: {
      size: {
        sm: 'size-6 text-[9.6px]',
        md: 'size-8 text-[12.8px]',
        lg: 'size-10 text-[16px]',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>,
    VariantProps<typeof avatar> {
  src?: string
  alt?: string
  /** Initials shown when no image (or while loading). */
  initials?: string
  /** Override fallback background (default canvas gray #E3E7EC). */
  fallbackClassName?: string
}

export const Avatar = forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, size, src, alt, initials, fallbackClassName, ...props }, ref) => (
    <AvatarPrimitive.Root ref={ref} className={cn(avatar({ size }), className)} {...props}>
      {src ? (
        <AvatarPrimitive.Image src={src} alt={alt} className="size-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback
        delayMs={src ? 200 : undefined}
        className={cn(
          'flex size-full items-center justify-center bg-[#E3E7EC] font-[600] text-text-secondary',
          fallbackClassName,
        )}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  ),
)
Avatar.displayName = 'Avatar'

/**
 * AvatarStack — §2.13. Overlapping 28px avatars (-ml-2) each ringed in --surface
 * white, with an optional trailing +N chip on --surface-sunken. Children should be
 * <Avatar> (or any round element); the stack forces the 28px size + white ring.
 */
export interface AvatarStackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Count for the trailing "+N" chip. Omitted/≤0 → no chip. */
  overflow?: number
}

export function AvatarStack({ className, children, overflow, ...props }: AvatarStackProps) {
  return (
    <div className={cn('flex items-center pl-2', className)} {...props}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div key={i} className="-ml-2 size-7 rounded-pill ring-2 ring-surface [&>*]:size-full">
              {child}
            </div>
          ))
        : (
            <div className="-ml-2 size-7 rounded-pill ring-2 ring-surface [&>*]:size-full">{children}</div>
          )}
      {overflow && overflow > 0 ? (
        <div className="-ml-2 flex size-7 items-center justify-center rounded-pill bg-surface-sunken text-[11.2px] font-[600] text-text-secondary ring-2 ring-surface shadow-[inset_0_0_0_1px_rgba(11,13,18,0.06)]">
          +{overflow}
        </div>
      ) : null}
    </div>
  )
}
