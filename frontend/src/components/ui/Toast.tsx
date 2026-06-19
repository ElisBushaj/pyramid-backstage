import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as RT from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, Check, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Toast — §2.10. A bg-surface card (w-340, rounded-md, shadow-overlay) carrying
 * a 3px status rail on the left edge, a 22×22 tone-tinted icon chip, a 14/600
 * title and a 13px secondary message. Four tones (info/success/warning/danger)
 * map to the status palette. Built on Radix Toast.
 *
 * Enter is a slide-up + fade; exit runs on --ease-exit. Both are transition-
 * based off Radix's data-[state] / data-[swipe] attributes — no keyframe
 * dependency. Mount <ToastProvider> once at the app root, then call the
 * `toast()` method from useToast() anywhere beneath it.
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: Check,
  warning: AlertTriangle,
  danger: AlertTriangle,
}

const card = cva(
  'flex w-[340px] gap-3 rounded-md border-l-[3px] bg-surface p-3.5 shadow-overlay outline-none transition-[transform,opacity] duration-std ease-std data-[state=closed]:duration-micro data-[state=closed]:ease-exit data-[state=closed]:opacity-0 data-[state=open]:translate-y-0 data-[state=open]:opacity-100 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[state=closed]:translate-y-1',
  {
    variants: {
      tone: {
        info: 'border-l-info',
        success: 'border-l-success',
        warning: 'border-l-warning',
        danger: 'border-l-danger',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

const chip = cva('flex size-[22px] shrink-0 items-center justify-center rounded-sm', {
  variants: {
    tone: {
      info: 'bg-info-subtle text-info',
      success: 'bg-success-subtle text-success',
      warning: 'bg-warning-subtle text-warning',
      danger: 'bg-danger-subtle text-danger',
    },
  },
  defaultVariants: { tone: 'info' },
})

export interface ToastProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RT.Root>, 'title'>,
    VariantProps<typeof card> {
  title: string
  message?: string
}

/**
 * Toast — the visual card. Renders inside the viewport that ToastProvider
 * mounts. Usually you go through useToast() rather than rendering this directly.
 */
export function Toast({ className, tone = 'info', title, message, ...props }: ToastProps) {
  const Icon = TONE_ICON[tone ?? 'info']
  return (
    <RT.Root className={cn(card({ tone }), className)} {...props}>
      <span aria-hidden className={chip({ tone })}>
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <RT.Title className="text-[14px] font-[600] text-text-primary">{title}</RT.Title>
        {message ? (
          <RT.Description className="mt-0.5 text-[13px] leading-[18px] text-text-secondary">
            {message}
          </RT.Description>
        ) : null}
      </div>
      <RT.Close
        aria-label="Dismiss"
        className="-mr-0.5 -mt-0.5 self-start rounded-sm p-0.5 text-text-tertiary outline-none transition-colors duration-micro ease-std hover:text-text-primary focus-visible:outline-none focus-visible:shadow-ring-medium"
      >
        <X className="size-[13px]" strokeWidth={2} />
      </RT.Close>
    </RT.Root>
  )
}

interface ToastInput {
  tone?: ToastTone
  title: string
  message?: string
  duration?: number
}

interface QueuedToast extends ToastInput {
  id: number
}

interface ToastContextValue {
  toast: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/**
 * useToast — call `toast({ tone, title, message })` to enqueue a toast. Must be
 * used inside <ToastProvider>.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

export interface ToastProviderProps {
  children: React.ReactNode
  /** Default auto-dismiss in ms; per-toast `duration` overrides. */
  duration?: number
}

/**
 * ToastProvider — wraps the app once. Provides the Radix toast context plus a
 * fixed bottom-right viewport (z above the modal layer) and the useToast() hook.
 */
export function ToastProvider({ children, duration = 5000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<QueuedToast[]>([])

  const toast = useCallback((input: ToastInput) => {
    setToasts((prev) => [...prev, { ...input, id: Date.now() + Math.random() }])
  }, [])

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      <RT.Provider duration={duration} swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <Toast
            key={t.id}
            tone={t.tone ?? 'info'}
            title={t.title}
            message={t.message}
            duration={t.duration}
            onOpenChange={(open) => {
              if (!open) remove(t.id)
            }}
          />
        ))}
        <RT.Viewport className="fixed bottom-0 right-0 z-toast m-0 flex w-[372px] max-w-[100vw] list-none flex-col gap-3 p-4 outline-none" />
      </RT.Provider>
    </ToastContext.Provider>
  )
}
