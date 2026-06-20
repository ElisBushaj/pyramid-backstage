import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// F16 — each asset carries a QR that encodes its assetId. Scanning it (Scanner page)
// pulls the asset up for check-in/out. Generated offline; no network, no external service.
export function AssetQr({ value, size = 132, label }: { value: string; size?: number; label?: string }) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => {
    let active = true
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#0A0C10', light: '#FFFFFF' } })
      .then((url) => active && setDataUrl(url))
      .catch(() => active && setDataUrl(''))
    return () => {
      active = false
    }
  }, [value, size])

  return (
    <div className="inline-flex flex-col items-center gap-2">
      {dataUrl ? (
        <img src={dataUrl} alt={label ?? value} width={size} height={size} className="rounded-md border border-border-subtle bg-white p-1.5" />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded-md border border-border-subtle bg-surface-muted" />
      )}
      {label && <span className="font-mono text-[11px] text-text-tertiary">{label}</span>}
    </div>
  )
}
