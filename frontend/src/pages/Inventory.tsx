import { useState } from 'react'
import { useAssets } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input, Select } from '@/components/ui/Input'
import { Table, THead, TH, TR, TD } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { InventoryMeter } from '@/components/command/InventoryMeter'
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback'

const TYPES = ['SEATING', 'TABLE', 'MICROPHONE', 'SCREEN', 'PROJECTOR', 'STAGE_UNIT', 'LIGHTING', 'OTHER']

export default function Inventory() {
  const t = useT()
  const [type, setType] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const { data, isLoading } = useAssets({
    type: type || undefined,
    start: start ? new Date(start).toISOString() : undefined,
    end: end ? new Date(end).toISOString() : undefined,
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('inventory.title')}
        filters={
          <>
            <Select className="w-44" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">{t('ui.common.all')}</option>
              {TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
            <Input className="w-48" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input className="w-48" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </>
        }
      />
      {isLoading ? (
        <LoadingBlock />
      ) : data && data.length === 0 ? (
        <EmptyState title={t('inventory.empty')} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t('users.name')}</TH>
              <TH>{t('requests.type')}</TH>
              <TH>{t('inventory.location')}</TH>
              <TH className="w-64">{t('inventory.available')}</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            {(data ?? []).map((a) => (
              <TR key={a.id} className="hover:bg-transparent">
                <TD className="font-[550] text-text-primary">{a.name}</TD>
                <TD>{a.type}</TD>
                <TD>{a.location}</TD>
                <TD><InventoryMeter available={a.availableQuantity ?? a.totalQuantity} total={a.totalQuantity} /></TD>
                <TD><StatusBadge status={a.status} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
