import { useState } from 'react'
import { useSpaces } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { LoadingBlock } from '@/components/ui/Feedback'

/** A light availability view: pick a day, see each space free/busy for 09:00–18:00. */
export default function Calendar() {
  const t = useT()
  const [day, setDay] = useState('2026-07-22')
  const start = new Date(`${day}T09:00:00Z`).toISOString()
  const end = new Date(`${day}T18:00:00Z`).toISOString()
  const { data, isLoading } = useSpaces({ start, end })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.calendar')}
        filters={<Input className="w-44" type="date" value={day} onChange={(e) => setDay(e.target.value)} />}
      />
      {isLoading ? (
        <LoadingBlock rows={4} />
      ) : (
        <Card>
          <CardBody className="flex flex-col gap-2 px-0 py-0">
            {(data ?? []).map((s) => (
              <div key={s.id} className="flex items-center gap-4 border-b border-border-subtle px-5 py-3 last:border-0">
                <span className="w-40 shrink-0 text-[14px] font-[550] text-text-primary">{s.name}</span>
                <div className="h-6 flex-1 overflow-hidden rounded-sm bg-surface-sunken">
                  <div className={cn('flex h-full items-center justify-center text-[11px] font-[550] text-text-inverted', s.available ? 'bg-success' : 'bg-danger')} style={{ width: '100%' }}>
                    {s.available ? t('spaces.available') : t('spaces.unavailable')}
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
