import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'

// Minimal typing for the native BarcodeDetector (not in the standard TS DOM lib).
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
}
const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector

// F16 — progressive-enhancement camera QR scan. Falls back to manual selection when the
// native BarcodeDetector or the camera is unavailable (the locked self-sufficient posture).
export function QrScanner({ onDetect, unsupportedLabel, startLabel, stopLabel, hintLabel }: {
  onDetect: (value: string) => void
  unsupportedLabel: string
  startLabel: string
  stopLabel: string
  hintLabel: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [active, setActive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActive(false)
  }

  useEffect(() => () => stop(), [])

  async function start() {
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      setActive(true)
      const detector = new Detector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const hits = await detector.detect(video)
          if (hits[0]?.rawValue) {
            onDetect(hits[0].rawValue.trim())
            stop()
            return
          }
        } catch {
          /* transient decode error — keep scanning */
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      setError(unsupportedLabel)
      stop()
    }
  }

  if (!Detector) {
    return <p className="rounded-md border border-border-subtle bg-surface-muted px-3.5 py-2.5 text-[13px] text-text-tertiary">{unsupportedLabel}</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-lg border border-border-subtle bg-black/90" style={{ aspectRatio: '4 / 3' }}>
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-tertiary">
            <Camera className="size-6" />
            <span className="text-[12px]">{hintLabel}</span>
          </div>
        )}
        {active && <div className="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-accent/80" />}
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {active ? (
        <Button variant="secondary" size="sm" onClick={stop}><CameraOff className="size-3.5" /> {stopLabel}</Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={start}><Camera className="size-3.5" /> {startLabel}</Button>
      )}
    </div>
  )
}
