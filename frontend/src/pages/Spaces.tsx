import { useState } from 'react'
import { useSpaces } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input, Select } from '@/components/ui/Input'
import { SpaceCard } from '@/components/command/SpaceCard'
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback'

const LAYOUTS = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION']

export default function Spaces() {
  const t = useT()
  const [layout, setLayout] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const { data, isLoading } = useSpaces({
    layout: layout || undefined,
    minCapacity: minCapacity || undefined,
    start: start ? new Date(start).toISOString() : undefined,
    end: end ? new Date(end).toISOString() : undefined,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('spaces.title')}
        filters={
          <>
            <Select className="w-40" value={layout} onChange={(e) => setLayout(e.target.value)}>
              <option value="">{t('field.layout')}: {t('ui.common.all')}</option>
              {LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
            <Input className="w-36" type="number" min={1} placeholder={t('spaces.minCapacity')} value={minCapacity} onChange={(e) => setMinCapacity(e.target.value)} />
            <Input className="w-48" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input className="w-48" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </>
        }
      />
      {isLoading ? (
        <LoadingBlock rows={3} />
      ) : data && data.length === 0 ? (
        <EmptyState title={t('spaces.empty')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((s) => <SpaceCard key={s.id} space={s} layout={layout || undefined} />)}
        </div>
      )}
    </div>
  )
}
