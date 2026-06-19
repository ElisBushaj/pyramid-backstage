import { NavLink, Outlet, useNavigate } from 'react-router'
import {
  LayoutDashboard, Inbox, CalendarDays, Building2, Boxes, ListChecks, AlertTriangle, ScrollText, Users, LogOut, Search, Radio,
} from 'lucide-react'
import { useMe, useLogout } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { LocaleToggle } from './LocaleToggle'

interface NavItem { to: string; label: string; icon: React.ElementType; adminOnly?: boolean }

export function AppShell() {
  const t = useT()
  const navigate = useNavigate()
  const { data: me } = useMe()
  const logout = useLogout()
  const isAdmin = me?.role === 'ADMIN'

  const groups: { title: string; items: NavItem[] }[] = [
    { title: t('nav.overview'), items: [{ to: '/', label: t('nav.dashboard'), icon: LayoutDashboard }] },
    { title: t('nav.pipeline'), items: [{ to: '/requests', label: t('nav.requests'), icon: Inbox }, { to: '/calendar', label: t('nav.calendar'), icon: CalendarDays }] },
    { title: t('nav.resources'), items: [{ to: '/spaces', label: t('nav.spaces'), icon: Building2 }, { to: '/inventory', label: t('nav.inventory'), icon: Boxes }] },
    { title: t('nav.operations'), items: [{ to: '/tasks', label: t('nav.tasks'), icon: ListChecks }, { to: '/conflicts', label: t('nav.conflicts'), icon: AlertTriangle }] },
    { title: t('nav.record'), items: [{ to: '/audit', label: t('nav.audit'), icon: ScrollText }] },
  ]
  if (isAdmin) groups.push({ title: t('nav.settings'), items: [{ to: '/settings/users', label: t('nav.users'), icon: Users }] })

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border-subtle bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border-subtle px-5">
          <div className="size-6 rounded-sm bg-accent" />
          <span className="text-[14px] font-[600] text-text-primary">{t('brand.name')}</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g) => (
            <div key={g.title} className="mb-4">
              <p className="px-2 pb-1.5 text-[11px] font-[600] uppercase tracking-[0.04em] text-text-tertiary">{g.title}</p>
              {g.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn('mb-0.5 flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] font-[500] transition-colors', isActive ? 'bg-accent-muted text-accent' : 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary')
                  }
                >
                  <item.icon className="size-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-sticky flex h-14 items-center gap-3 border-b border-border-subtle bg-surface/90 px-4 backdrop-blur md:px-6">
          <button onClick={() => navigate('/requests')} className="flex h-8 w-full max-w-72 items-center gap-2 rounded-sm border border-border-subtle bg-surface-subtle px-3 text-[13px] text-text-tertiary hover:border-border-strong">
            <Search className="size-3.5" />
            {t('requests.searchPlaceholder')}
          </button>
          <div className="ml-auto flex items-center gap-3">
            <Badge tone="info" className="hidden sm:inline-flex"><Radio className="size-3" /> {t('live.degraded')}</Badge>
            <LocaleToggle />
            {me ? (
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <p className="text-[12px] font-[550] leading-tight text-text-primary">{me.name}</p>
                  <p className="text-[11px] leading-tight text-text-tertiary">{me.role}</p>
                </div>
                <div className="flex size-8 items-center justify-center rounded-pill bg-surface-inverted text-[12px] font-[600] text-text-inverted">
                  {me.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                </div>
                <button onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })} className="rounded-sm p-1.5 text-text-tertiary hover:bg-surface-subtle hover:text-danger" title={t('auth.signOut')}>
                  <LogOut className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 md:px-6 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
