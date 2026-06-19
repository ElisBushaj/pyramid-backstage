import { forwardRef } from 'react'
import * as RS from '@radix-ui/react-switch'
import { cn } from '@/lib/cn'

/**
 * Switch — §2.5. Track 36×21 pill, knob 17×17. Off track is --border-strong,
 * on track is --accent. The knob sits 2px from the left edge and slides to
 * 17px when checked (a 15px travel). Focus is the medium accent ring
 * (--ring-medium, .30). Disabled-on is the muted accent (--accent-disabled),
 * disabled-off is --border-subtle. Motion: duration-micro / ease-std.
 */
export const Switch = forwardRef<
  React.ComponentRef<typeof RS.Root>,
  RS.SwitchProps
>(({ className, ...props }, ref) => (
  <RS.Root
    ref={ref}
    className={cn(
      'group inline-flex h-[21px] w-9 shrink-0 items-center rounded-pill bg-border-strong outline-none transition-colors duration-micro ease-std focus-visible:outline-none focus-visible:shadow-ring-medium',
      'data-[state=checked]:bg-accent',
      'disabled:cursor-not-allowed data-[state=unchecked]:disabled:bg-border-subtle data-[state=checked]:disabled:bg-accent-disabled',
      className,
    )}
    {...props}
  >
    <RS.Thumb className="pointer-events-none block size-[17px] translate-x-0.5 rounded-pill bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-micro ease-std data-[state=checked]:translate-x-[17px]" />
  </RS.Root>
))
Switch.displayName = 'Switch'
