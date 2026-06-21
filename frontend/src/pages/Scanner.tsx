import { useMemo, useState } from 'react'
import { Search, MapPin, Lock } from 'lucide-react'
import { useAssets, useScanAsset, useSpaces } from '@/api/hooks'
import { useCan } from '@/lib/abilities'
import { useT } from '@/i18n/useT'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Combobox } from '@/components/ui/Combobox'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/Feedback'
import { useToast } from '@/components/ui/Toast'
import { AssetQr } from '@/components/command/AssetQr'
import { QrScanner } from '@/components/command/QrScanner'
import type { AssetMovementAction } from '@/api/types/assets'

export default function Scanner() {
  const t = useT()
  const { toast } = useToast()
  const can = useCan()
  const canScan = can('scanAsset')
  const assetsQuery = useAssets({})
  const assets = assetsQuery.data ?? []
  const spaces = useSpaces({}).data ?? []

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [action, setAction] = useState<AssetMovementAction>('CHECK_OUT')
  const [quantity, setQuantity] = useState('1')
  const [toLocation, setToLocation] = useState('')
  const [note, setNote] = useState('')

  const selected = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId])
  const scan = useScanAsset(selected?.id ?? '')

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return s ? assets.filter((a) => a.name.toLowerCase().includes(s) || a.id.toLowerCase().includes(s)) : assets
  }, [assets, search])

  // "To location" offers the full Spaces catalog (every place in the Pyramid,
  // not just the ones an asset currently sits in), unioned with any asset
  // locations not in that catalog so legacy/free-text values stay selectable.
  // `allowCreate` still covers a brand-new spot no record mentions yet.
  const locationOptions = useMemo(() => {
    const names = Array.from(
      new Set([...spaces.map((s) => s.name), ...assets.map((a) => a.location)].filter(Boolean)),
    )
    names.sort((a, b) => a.localeCompare(b))
    return names.map((name) => ({ value: name, label: name }))
  }, [spaces, assets])

  // A CHECK_IN returns units to where the asset lives, so "To location" isn't
  // collected for it — we default to the asset's current/home location.
  const isCheckIn = action === 'CHECK_IN'
  const effectiveToLocation = isCheckIn ? (selected?.location ?? '') : toLocation
  // Cap the quantity at what the move can actually touch: outbound moves can't
  // exceed what's available, a check-in can't return more than is currently out.
  const qtyMax = selected ? (isCheckIn ? (selected.checkedOutQuantity ?? 0) : (selected.availableQuantity ?? selected.totalQuantity)) : undefined
  const qtyNum = Number(quantity)
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= 1 && (qtyMax == null || qtyNum <= qtyMax)
  const canSubmit = !!selected && canScan && qtyValid && !!effectiveToLocation.trim()

  function selectById(id: string) {
    const hit = assets.find((a) => a.id === id || a.id.toLowerCase() === id.toLowerCase())
    if (hit) {
      setSelectedId(hit.id)
      toast({ tone: 'info', title: hit.name, message: t('scanner.selected') })
    } else {
      toast({ tone: 'danger', title: t('scanner.unknownCode'), message: id })
    }
  }

  function submit() {
    if (!canSubmit || !selected) return
    scan.mutate(
      { action, quantity: qtyNum, toLocation: effectiveToLocation.trim(), note: note.trim() || undefined },
      {
        onSuccess: (res) => {
          toast({ tone: 'success', title: t('scanner.recorded'), message: `${selected.name} · ${res.movement.toLocation}` })
          setNote('')
        },
        onError: () => toast({ tone: 'danger', title: t('scanner.failed') }),
      },
    )
  }

  const actionOptions = [
    { value: 'CHECK_OUT' as const, label: t('scanner.checkOut') },
    { value: 'CHECK_IN' as const, label: t('scanner.checkIn') },
    { value: 'RELOCATE' as const, label: t('scanner.relocate') },
  ]

  return (
    <div>
      <PageHeader breadcrumb={[t('nav.operations'), t('scanner.title')]} title={t('scanner.title')} subtitle={t('scanner.subtitle')} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ── Find / scan an asset ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-border-subtle p-5">
          <h2 className="mb-3.5 text-[15px] font-[600] text-text-primary">{t('scanner.findAsset')}</h2>

          <QrScanner
            onDetect={selectById}
            unsupportedLabel={t('scanner.cameraUnsupported')}
            startLabel={t('scanner.startCamera')}
            stopLabel={t('scanner.stopCamera')}
            hintLabel={t('scanner.cameraHint')}
          />

          <div className="mt-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('scanner.searchPlaceholder')} prefix={<Search className="size-4 text-text-tertiary" />} />
          </div>

          <div className="mt-3 max-h-[280px] overflow-auto rounded-md border border-border-subtle">
            {assetsQuery.isLoading ? (
              <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}</div>
            ) : assetsQuery.isError ? (
              <ErrorState title={t('inventory.loadError')} message={t('error.generic')} onRetry={() => assetsQuery.refetch()} retryLabel={t('ui.common.retry')} />
            ) : filtered.length === 0 ? (
              <EmptyState title={t('inventory.emptyTitle')} message={t('inventory.empty')} />
            ) : (
              filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className={cn(
                    'flex w-full items-center justify-between border-b border-border-subtle px-3.5 py-2.5 text-left last:border-0 hover:bg-surface-muted',
                    selectedId === a.id && 'bg-accent-muted',
                  )}
                >
                  <span className="flex flex-col">
                    <span className="text-[13px] font-[550] text-text-primary">{a.name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-text-tertiary"><MapPin className="size-3" /> {a.location}</span>
                  </span>
                  {!!a.checkedOutQuantity && (
                    <span className="rounded-pill bg-accent-muted px-2 py-0.5 text-[11px] font-[600] text-accent">{a.checkedOutQuantity} {t('scanner.out')}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </section>

        {/* ── Record a movement ────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border-subtle p-5">
          {!selected ? (
            <EmptyState title={t('scanner.noAsset')} message={t('scanner.noAssetBody')} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[15px] font-[600] text-text-primary">{selected.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-[13px] text-text-secondary"><MapPin className="size-3.5" /> {selected.location}</p>
                  <p className="mt-1 text-[12px] text-text-tertiary">
                    {t('scanner.currentlyOut')}: <span className="font-mono font-[600] text-text-primary">{selected.checkedOutQuantity ?? 0}</span> / {selected.totalQuantity}
                  </p>
                </div>
                <AssetQr value={selected.id} label={selected.id} size={108} />
              </div>

              {!canScan ? (
                <div className="flex items-start gap-2.5 rounded-md border border-border-subtle bg-surface-muted px-3.5 py-3 text-[13px] text-text-secondary">
                  <Lock className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
                  <span>{t('scanner.readOnlyNotice')}</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1.5 block text-[12px] font-[550] text-text-secondary">{t('scanner.action')}</label>
                    <SegmentedControl options={actionOptions} value={action} onChange={setAction} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[12px] font-[550] text-text-secondary">{t('scanner.quantity')}</label>
                      <Input type="number" min={1} max={qtyMax} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                    </div>
                    {!isCheckIn && (
                      <div>
                        <label className="mb-1.5 block text-[12px] font-[550] text-text-secondary">{t('scanner.toLocation')}</label>
                        <Combobox
                          value={toLocation}
                          onChange={setToLocation}
                          options={locationOptions}
                          className="w-full"
                          placeholder={t('scanner.toLocationPlaceholder')}
                          searchPlaceholder={t('scanner.toLocationSearch')}
                          emptyMessage={(query) => t('scanner.toLocationEmpty', { query })}
                          allowCreate
                          createLabel={(query) => t('scanner.toLocationCreate', { query })}
                          aria-label={t('scanner.toLocation')}
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[12px] font-[550] text-text-secondary">{t('scanner.note')}</label>
                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('scanner.notePlaceholder')} />
                  </div>

                  <Button fullWidth loading={scan.isPending} disabled={!canSubmit} onClick={submit}>
                    {t('scanner.record')}
                  </Button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
