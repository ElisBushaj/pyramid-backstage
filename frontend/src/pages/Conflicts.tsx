import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { useConflicts, useSpaces } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input, Select } from '@/components/ui/Input'
import { ConflictBanner } from '@/components/command/ConflictBanner'
import { LoadingBlock } from '@/components/ui/Feedback'

export default function Conflicts() {
  const t = useT()
  const { data: spaces } = useSpaces({})
  const [spaceId, setSpaceId] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const ready = !!start && !!end
  const { data: conflicts, isLoading } = useConflicts(
    { spaceId: spaceId || undefined, start: start ? new Date(start).toISOString() : undefined, end: end ? new Date(end).toISOString() : undefined },
    ready,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.conflicts')}
        filters={
          <>
            <Select className="w-48" value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              <option value="">{t('spaces.title')}: {t('ui.common.all')}</option>
              {(spaces ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Input className="w-48" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input className="w-48" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </>
        }
      />
      {!ready ? (
        <p className="text-[13px] text-text-tertiary">{t('spaces.window')}…</p>
      ) : isLoading ? (
        <LoadingBlock rows={2} />
      ) : conflicts && conflicts.length > 0 ? (
        <ConflictBanner conflicts={conflicts} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-success-subtle bg-success-subtle px-6 py-14 text-center">
          <ShieldCheck className="size-6 text-success" />
          <p className="text-[14px] text-success">{t('conflict.none')}</p>
        </div>
      )}
    </div>
  )
}
