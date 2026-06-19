import { Navigate } from 'react-router'
import { useMe } from '@/api/hooks'
import { useT } from '@/i18n/useT'

/** Gate the app behind a live session. 401 (no/expired session) → /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const t = useT()
  const { data, isLoading, isError } = useMe()
  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-text-tertiary">{t('ui.common.loading')}</div>
  if (isError || !data) return <Navigate to="/login" replace />
  return <>{children}</>
}
