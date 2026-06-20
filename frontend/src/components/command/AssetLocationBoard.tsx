import { Link } from 'react-router'
import { MapPin, PackageCheck } from 'lucide-react'
import { useAssets } from '@/api/hooks'
import { useT } from '@/i18n/useT'

// F16 — the live "where is everything right now" board: assets currently checked out,
// most-out first, driven off the GET /assets rollup (checkedOutQuantity + location).
export function AssetLocationBoard() {
  const t = useT()
  const assets = useAssets({}).data ?? []
  const out = assets
    .filter((a) => (a.checkedOutQuantity ?? 0) > 0)
    .sort((a, b) => (b.checkedOutQuantity ?? 0) - (a.checkedOutQuantity ?? 0))

  return (
    <section className="rounded-lg border border-border-subtle p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-[600] text-text-primary">{t('dashboard.whereIsIt')}</h2>
          <p className="text-[12px] text-text-tertiary">{t('dashboard.whereIsItSub')}</p>
        </div>
        <Link to="/scan" className="rounded-control p-1.5 text-accent outline-none hover:bg-accent-muted focus-visible:shadow-ring-medium" aria-label={t('nav.scan')}>
          <PackageCheck className="size-4" />
        </Link>
      </div>

      {out.length === 0 ? (
        <p className="rounded-md border border-border-subtle bg-surface-muted px-3.5 py-4 text-center text-[13px] text-text-tertiary">{t('dashboard.nothingOut')}</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {out.slice(0, 6).map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2.5">
              <Link to={`/inventory/${a.id}`} className="flex flex-col hover:text-accent">
                <span className="text-[13px] font-[550] text-text-primary">{a.name}</span>
                <span className="flex items-center gap-1 text-[11px] text-text-tertiary"><MapPin className="size-3" /> {a.location}</span>
              </Link>
              <span className="rounded-pill bg-accent-muted px-2.5 py-0.5 text-[12px] font-[600] tabular-nums text-accent">
                {a.checkedOutQuantity} {t('dashboard.unitsOut')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
