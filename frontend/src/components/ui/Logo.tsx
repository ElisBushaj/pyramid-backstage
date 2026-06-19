import { cn } from '@/lib/cn'

/**
 * PyramidLogo — the brand mark. A rounded tile with the 135° accent→accent-pressed
 * gradient and a white pyramid (outline + a lighter inner triangle). Used in the
 * sidebar header (28), the mobile top bar (26) and the AuthShell (44).
 */
export function PyramidLogo({ size = 30, className }: { size?: number; className?: string }) {
  const inner = Math.round(size * 0.55)
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-control bg-[linear-gradient(135deg,var(--accent),var(--accent-pressed))]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={inner} height={inner} viewBox="0 0 18 18" fill="none">
        <path d="M9 1.5 16.5 16.5H1.5L9 1.5Z" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
        <path d="M9 6 12.5 13H5.5L9 6Z" fill="#fff" fillOpacity={0.35} />
      </svg>
    </div>
  )
}
