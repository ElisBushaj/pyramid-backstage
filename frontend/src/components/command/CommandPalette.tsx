import { useState } from 'react'
import { useNavigate } from 'react-router'
import * as RD from '@radix-ui/react-dialog'
import { Search, FileText, Building2, Boxes } from 'lucide-react'
import { useRequests, useSpaces, useAssets } from '@/api/hooks'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'

/**
 * CommandPalette — the real ⌘K global search. A centered Radix dialog that
 * queries requests/spaces/assets on a debounced term and lists the matches
 * grouped; selecting a row navigates to its detail surface and closes. Opening
 * is owned by AppShell (search button + ⌘K key handler) via `open`/`onOpenChange`.
 *
 * The data hooks live in PaletteBody, which is rendered INSIDE RD.Content — so it
 * mounts only while the palette is open. That keeps the spaces/assets catalog
 * fetches from firing on every page load just because the shell is mounted.
 */

interface PaletteItem {
  key: string
  to: string
  label: string
  meta?: string
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-modal bg-[rgba(11,13,18,0.35)] transition-opacity duration-std ease-std data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <RD.Content
          aria-label={t('shell.searchPlaceholder')}
          className="fixed left-1/2 top-[12vh] z-modal w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg bg-surface shadow-overlay outline-none transition-[opacity,transform] duration-std ease-std data-[state=closed]:scale-[0.97] data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100"
        >
          <RD.Title className="sr-only">{t('shell.searchPlaceholder')}</RD.Title>
          <PaletteBody onClose={() => onOpenChange(false)} />
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim(), 300)
  const hasQuery = debounced.length > 0

  // Only mounted while the palette is open, so these run on open, not on every page.
  const requests = useRequests(hasQuery ? { q: debounced, pageSize: 5 } : { pageSize: 5 })
  const spaces = useSpaces({})
  const assets = useAssets({})

  const requestRows = requests.data?.data ?? []
  const spaceRows = spaces.data ?? []
  const assetRows = assets.data ?? []

  // Spaces/assets aren't server-filtered by a free-text param, so narrow client-side.
  const term = debounced.toLowerCase()
  const matchedSpaces = hasQuery ? spaceRows.filter((s) => s.name.toLowerCase().includes(term)) : []
  const matchedAssets = hasQuery
    ? assetRows.filter((a) => a.name.toLowerCase().includes(term) || a.location.toLowerCase().includes(term))
    : []

  const groups: { label: string; icon: React.ElementType; items: PaletteItem[] }[] = [
    {
      label: t('search.groupRequests'),
      icon: FileText,
      items: requestRows.map((r) => ({ key: `req-${r.id}`, to: `/requests/${r.id}`, label: r.title, meta: r.organizerName })),
    },
    {
      label: t('search.groupSpaces'),
      icon: Building2,
      items: matchedSpaces.map((s) => ({ key: `space-${s.id}`, to: `/spaces/${s.id}`, label: s.name, meta: t('search.spaceFloor', { n: s.floor }) })),
    },
    {
      label: t('search.groupAssets'),
      icon: Boxes,
      items: matchedAssets.map((a) => ({ key: `asset-${a.id}`, to: `/inventory/${a.id}`, label: a.name, meta: a.location })),
    },
  ]

  const isEmpty = hasQuery && groups.every((g) => g.items.length === 0)

  function select(to: string) {
    onClose()
    navigate(to)
  }

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-3">
        <Search className="size-[16px] shrink-0 text-text-tertiary" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          className="h-6 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>

      <div className="max-h-[56vh] overflow-y-auto py-1.5">
        {!hasQuery ? (
          <p className="px-4 py-6 text-center text-[13px] text-text-tertiary">{t('search.placeholder')}</p>
        ) : isEmpty ? (
          <p className="px-4 py-6 text-center text-[13px] text-text-tertiary">{t('search.empty')}</p>
        ) : (
          groups.map((g) =>
            g.items.length ? (
              <div key={g.label} className="mb-1">
                <p className="px-4 pb-1 pt-2 text-[11px] font-[600] uppercase tracking-[0.05em] text-text-tertiary">{g.label}</p>
                {g.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => select(item.to)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-4 py-2 text-left outline-none transition-colors',
                      'hover:bg-surface-sunken focus-visible:bg-surface-sunken',
                    )}
                  >
                    <g.icon className="size-4 shrink-0 text-text-tertiary" />
                    <span className="truncate text-[14px] text-text-primary">{item.label}</span>
                    {item.meta ? <span className="ml-auto truncate pl-3 text-[12px] text-text-tertiary">{item.meta}</span> : null}
                  </button>
                ))}
              </div>
            ) : null,
          )
        )}
      </div>
    </>
  )
}
