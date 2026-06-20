import { Navigate, NavLink, Outlet } from 'react-router'
import { Plus, ListChecks, LogOut } from 'lucide-react'
import { useMe, useLogout } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import { PyramidLogo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { LocaleToggle } from './LocaleToggle'

// F15 — the external partner portal chrome. A deliberately lean shell (no staff nav):
// partners only submit requests and watch their own status. Non-partners are bounced
// back to the staff Command Center.
export function PortalShell() {
  const t = useT()
  const me = useMe().data
  const logout = useLogout()

  if (me && me.role !== 'PARTNER') return <Navigate to="/" replace />

  const link = ({ isActive }: { isActive: boolean }) =>
    cn('flex items-center gap-1.5 rounded-control px-3 py-1.5 text-[13px] font-[500]', isActive ? 'bg-accent-muted text-accent' : 'text-text-secondary hover:bg-surface-sunken')

  return (
    <div className="min-h-screen bg-surface">
      <header className="flex flex-wrap items-center gap-4 border-b border-border-subtle px-6 py-3">
        <PyramidLogo className="size-7 text-accent" />
        <div className="flex flex-col">
          <span className="text-[14px] font-[600] text-text-primary">{t('portal.title')}</span>
          <span className="text-[11px] text-text-tertiary">{t('portal.subtitle')}</span>
        </div>
        <nav className="ml-4 flex items-center gap-1">
          <NavLink to="/portal" end className={link}><ListChecks className="size-4" /> {t('portal.myRequests')}</NavLink>
          <NavLink to="/portal/new" className={link}><Plus className="size-4" /> {t('portal.newRequest')}</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle />
          <Button variant="ghost" size="sm" onClick={() => logout.mutate()}><LogOut className="size-3.5" /> {t('portal.logout')}</Button>
        </div>
      </header>
      <main className="mx-auto max-w-[840px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
