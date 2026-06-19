import { create } from 'zustand'

const COLLAPSE_KEY = 'pyramid.sidebar.collapsed'

function initialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(COLLAPSE_KEY) === '1'
}

interface UIStore {
  /** Desktop sidebar collapsed to the 64px icon rail. Persisted. */
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  /** Mobile bottom-drawer nav open. */
  mobileNavOpen: boolean
  setMobileNav: (open: boolean) => void
  /** Copilot overlay panel open. */
  copilotOpen: boolean
  toggleCopilot: () => void
  setCopilot: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: initialCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      if (typeof window !== 'undefined') window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return { sidebarCollapsed: next }
    }),
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  copilotOpen: false,
  toggleCopilot: () => set((s) => ({ copilotOpen: !s.copilotOpen })),
  setCopilot: (open) => set({ copilotOpen: open }),
}))
