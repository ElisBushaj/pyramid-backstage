import { Suspense } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useT } from '@/i18n/useT'

/**
 * Slim root shell — scroll restoration + a Suspense fallback around the routed
 * outlet. Pages and per-segment layouts land here later from the Claude Design
 * export; this chassis ships only the bootable shell.
 */
export default function RootLayout() {
  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<RootSkeleton />}>
        <Outlet />
      </Suspense>
    </>
  )
}

function RootSkeleton() {
  const t = useT()
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-text-secondary">
      <span className="animate-pulse">{t('ui.common.loading')}</span>
    </div>
  )
}
