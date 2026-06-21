import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  LayoutDashboard, FileText, CalendarDays, Building2, Boxes, ListChecks, AlertTriangle,
  CheckCircle2, Clock, Users, Sparkles, Search, ChevronLeft, ChevronRight, Menu, LogOut, QrCode,
} from 'lucide-react'
import { useMe, useLogout, useDashboardStats, useConflicts } from '@/api/hooks'
import { useCopilot } from '@/hooks/useCopilot'
import { aiConfigured } from '@/api/ai'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import { useUIStore } from '@/stores/ui'
import type { Role } from '@/api/types/auth'
import { PyramidLogo } from '@/components/ui/Logo'
import { Kbd } from '@/components/ui/Kbd'
import { Avatar } from '@/components/ui/Avatar'
import { Drawer, DrawerContent } from '@/components/ui/Drawer'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu'
import { LocaleToggle } from './LocaleToggle'
import { CopilotPanel } from '@/components/command/CopilotPanel'
import { CommandPalette } from '@/components/command/CommandPalette'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  badgeKey?: 'requests' | 'inventory' | 'conflicts' | 'approvals'
  badgeTone?: 'neutral' | 'danger'
  adminOnly?: boolean
}
interface NavGroup { title: string; items: NavItem[] }

const ROLE_INK: Record<Role, string> = {
  ADMIN: 'text-accent',
  MANAGER: 'text-warning',
  OPS: 'text-success',
  VIEWER: 'text-text-tertiary',
  PARTNER: 'text-text-tertiary',
}

export function AppShell() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const meQuery = useMe()
  const me = meQuery.data
  const logout = useLogout()
  const isAdmin = me?.role === 'ADMIN'

  const { sidebarCollapsed, toggleSidebar, mobileNavOpen, setMobileNav, copilotOpen, toggleCopilot, setCopilot } = useUIStore()

  // Global Copilot — same live POST /chat wiring Intake uses; degrades to canned on 503.
  const copilot = useCopilot()

  // Global ⌘K command palette.
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Nav badge counts from real data (not the canvas mock); absent → no pill.
  const stats = useDashboardStats().data
  const conflicts = useConflicts({}).data
  const badges: Record<string, number | undefined> = {
    inventory: stats?.lowStockAssets.value,
    conflicts: conflicts?.length,
    approvals: stats?.pendingApprovals.value,
  }

  const groups: NavGroup[] = [
    { title: t('nav.overview'), items: [{ to: '/', label: t('nav.dashboard'), icon: LayoutDashboard }] },
    { title: t('nav.pipeline'), items: [
      { to: '/requests', label: t('nav.requests'), icon: FileText },
      { to: '/calendar', label: t('nav.calendar'), icon: CalendarDays },
    ] },
    { title: t('nav.resources'), items: [
      { to: '/spaces', label: t('nav.spaces'), icon: Building2 },
      { to: '/inventory', label: t('nav.inventory'), icon: Boxes, badgeKey: 'inventory', badgeTone: 'danger' },
      { to: '/scan', label: t('nav.scan'), icon: QrCode },
    ] },
    { title: t('nav.operations'), items: [
      { to: '/tasks', label: t('nav.tasks'), icon: ListChecks },
      { to: '/conflicts', label: t('nav.conflicts'), icon: AlertTriangle, badgeKey: 'conflicts', badgeTone: 'danger' },
      { to: '/approvals', label: t('nav.approvals'), icon: CheckCircle2, badgeKey: 'approvals', badgeTone: 'neutral' },
    ] },
    { title: t('nav.record'), items: [{ to: '/audit', label: t('nav.audit'), icon: Clock }] },
  ]
  if (isAdmin) groups.push({ title: t('nav.settings'), items: [{ to: '/settings/users', label: t('nav.users'), icon: Users }] })

  function isActive(to: string) {
    const [path, query] = to.split('?')
    if (query) return location.pathname === path && location.search.includes(query)
    if (path === '/') return location.pathname === '/'
    if (path === '/requests') return location.pathname === '/requests' && !location.search.includes('status=PROPOSED')
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const live = meQuery.isError ? 'degraded' : 'connected'

  // F15 — a partner has no staff surface; send them to their portal. (After all hooks.)
  if (me && me.role === 'PARTNER') return <Navigate to="/portal" replace />

  return (
    <div className="flex min-h-screen bg-surface">
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border-subtle bg-surface-subtle transition-[width] duration-std ease-std lg:flex',
          sidebarCollapsed ? 'w-16' : 'w-[220px]',
        )}
      >
        <div className={cn('flex h-14 items-center gap-2.5 border-b border-border-subtle', sidebarCollapsed ? 'justify-center px-0' : 'px-4')}>
          <PyramidLogo size={28} />
          {!sidebarCollapsed && <span className="text-[14px] font-[600] text-text-primary">Backstage</span>}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4">
          {groups.map((g) => (
            <NavGroupBlock key={g.title} group={g} collapsed={sidebarCollapsed} badges={badges} isActive={isActive} />
          ))}
        </nav>

        <div className="border-t border-border-subtle px-2.5 py-3">
          <button
            onClick={toggleSidebar}
            className={cn(
              'flex h-[34px] w-full items-center gap-[11px] rounded-control px-3 text-[14px] font-[400] text-text-secondary outline-none transition-colors hover:bg-surface-sunken focus-visible:shadow-ring-medium',
              sidebarCollapsed && 'justify-center px-0',
            )}
          >
            {sidebarCollapsed ? <ChevronRight className="size-4 text-text-tertiary" /> : <ChevronLeft className="size-4 text-text-tertiary" />}
            {!sidebarCollapsed && t('nav.collapse')}
          </button>
        </div>
      </aside>

      {/* ── Content column ──────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-sticky flex h-[52px] items-center gap-3 border-b border-border-subtle bg-surface px-4 lg:hidden">
          <button aria-label="Menu" onClick={() => setMobileNav(true)} className="rounded-control p-1 text-text-primary outline-none focus-visible:shadow-ring-medium">
            <Menu className="size-[18px]" />
          </button>
          <PyramidLogo size={26} />
          <span className="text-[15px] font-[600] text-text-primary">Backstage</span>
          <button aria-label={t('shell.copilot')} onClick={toggleCopilot} className="ml-auto rounded-control p-1.5 text-accent outline-none focus-visible:shadow-ring-medium">
            <Sparkles className="size-[18px]" />
          </button>
        </header>

        {/* Desktop top bar */}
        <header className="sticky top-0 z-sticky hidden h-14 items-center gap-3.5 border-b border-border-subtle bg-surface px-5 lg:flex">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-[34px] max-w-[420px] flex-1 items-center gap-2 rounded-control border border-border-subtle bg-surface-subtle px-3 text-[13px] text-text-tertiary outline-none transition-colors hover:border-border-strong focus-visible:shadow-ring-soft"
          >
            <Search className="size-[15px]" />
            <span className="truncate">{t('shell.searchPlaceholder')}</span>
            <Kbd className="ml-auto">⌘K</Kbd>
          </button>

          <div className="ml-auto flex items-center gap-3">
            <LiveStatusPill status={live} t={t} />
            <LocaleToggle />
            <button
              onClick={toggleCopilot}
              aria-pressed={copilotOpen}
              className="flex h-[34px] items-center gap-[7px] rounded-control border border-[#DCE6FB] bg-accent-muted px-3 text-[13px] font-[550] text-accent outline-none transition-colors hover:bg-[#E3ECFE] focus-visible:shadow-ring-medium"
            >
              <Sparkles className="size-3.5" />
              {t('shell.copilot')}
            </button>

            {me ? (
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 border-l border-border-subtle pl-3 outline-none focus-visible:shadow-ring-medium">
                  <div className="text-right">
                    <p className="text-[13px] font-[600] leading-[15px] text-text-primary">{shortName(me.name)}</p>
                    <p className={cn('text-[11px] font-[600] uppercase leading-tight', ROLE_INK[me.role])}>{t(`roles.${me.role}`)}</p>
                  </div>
                  <Avatar size="md" initials={initials(me.name)} fallbackClassName="bg-[#DCE6FB] text-text-secondary" className="size-[30px] text-[12px]" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate('/settings/users')} disabled={!isAdmin}>
                    <Users className="size-4" /> {t('nav.users')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}>
                    <LogOut className="size-4" /> {t('auth.signOut')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </header>

        <main className="flex-1 px-6 py-7 md:px-8">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom-drawer nav ────────────────────────────────── */}
      <Drawer open={mobileNavOpen} onOpenChange={setMobileNav}>
        <DrawerContent side="bottom" showClose={false} className="rounded-t-[18px] pb-6 lg:hidden">
          <div className="mx-auto mb-3.5 mt-1 h-1 w-9 rounded-pill bg-border-strong" />
          <nav className="max-h-[70vh] overflow-y-auto">
            {groups.map((g) => (
              <NavGroupBlock key={g.title} group={g} collapsed={false} badges={badges} isActive={isActive} onNavigate={() => setMobileNav(false)} />
            ))}
          </nav>
        </DrawerContent>
      </Drawer>

      {/* ── Copilot overlay (every page) ────────────────────────────── */}
      {copilotOpen ? (
        <>
          <div className="fixed inset-0 z-drawer bg-[rgba(11,13,18,0.3)] lg:bg-transparent" onClick={() => setCopilot(false)} />
          <div className="fixed bottom-0 right-0 top-0 z-drawer w-full max-w-[380px] border-l border-[#DCE6FB] shadow-overlay">
            <CopilotPanel
              state={copilot.state}
              messages={copilot.messages}
              inputValue={copilot.input}
              onInputChange={copilot.setInput}
              onSend={copilot.send}
              proposedAction={copilot.proposedAction}
              headsUp={copilot.headsUp}
              onDismiss={copilot.dismiss}
              onIgnore={copilot.ignore}
              onRetry={copilot.retry}
              stateLabel={!aiConfigured() || copilot.degraded ? t('intake.chatOffline') : undefined}
              onClose={() => setCopilot(false)}
              fullHeight
              className="h-full rounded-none border-0"
            />
          </div>
        </>
      ) : null}

      {/* ── Global ⌘K command palette ───────────────────────────────── */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

function NavGroupBlock({
  group, collapsed, badges, isActive, onNavigate,
}: {
  group: NavGroup
  collapsed: boolean
  badges: Record<string, number | undefined>
  isActive: (to: string) => boolean
  onNavigate?: () => void
}) {
  return (
    <div className="mb-[18px]">
      {!collapsed && (
        <p className="mb-1.5 px-3 text-[11px] font-[600] uppercase tracking-[0.05em] text-text-tertiary">{group.title}</p>
      )}
      {group.items.map((item) => {
        const active = isActive(item.to)
        const count = item.badgeKey ? badges[item.badgeKey] : undefined
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              'mb-0.5 flex h-[34px] items-center gap-[11px] rounded-control px-3 text-[14px] outline-none transition-colors focus-visible:shadow-ring-medium',
              collapsed && 'justify-center px-0',
              active ? 'bg-accent-muted font-[550] text-accent' : 'font-[400] text-text-secondary hover:bg-surface-sunken',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-text-tertiary')} />
            {!collapsed && (
              <>
                <span className="truncate">{item.label}</span>
                {count != null && count > 0 ? (
                  <span
                    className={cn(
                      'ml-auto rounded-pill px-[7px] py-px font-mono text-[11px] font-[600]',
                      item.badgeTone === 'danger' ? 'bg-danger-subtle text-danger' : 'bg-surface-sunken text-text-tertiary',
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        )
      })}
    </div>
  )
}

function LiveStatusPill({ status, t }: { status: 'connected' | 'degraded'; t: (k: string) => string }) {
  const connected = status === 'connected'
  return (
    <span
      className={cn(
        'inline-flex h-[30px] items-center gap-2 rounded-pill border px-3',
        connected ? 'border-[rgba(26,127,75,0.2)] bg-success-subtle' : 'border-[rgba(154,107,0,0.25)] bg-warning-subtle',
      )}
    >
      <span
        className={cn('size-[7px] rounded-pill', connected ? 'bg-success [animation:pulse-dot_1.8s_ease-in-out_infinite]' : 'bg-warning')}
      />
      <span className={cn('text-[12px] font-[600]', connected ? 'text-[#15613A]' : 'text-[#7A5500]')}>
        {connected ? t('shell.sessionLive') : t('shell.sessionDegraded')}
      </span>
    </span>
  )
}

function initials(name: string) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
}
function shortName(name: string) {
  const parts = name.split(' ')
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name
}
