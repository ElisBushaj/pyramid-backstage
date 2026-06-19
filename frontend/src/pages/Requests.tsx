import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Plus } from 'lucide-react'
import { useRequests } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { useLocaleStore } from '@/stores/locale'
import { formatDate } from '@/lib/format'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'
import { Table, THead, TH, TR, TD } from '@/components/ui/Table'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/Feedback'

const STATUSES = ['DRAFT', 'PROPOSED', 'APPROVED', 'SCHEDULED', 'COMPLETED', 'REJECTED']

export default function Requests() {
  const t = useT()
  const navigate = useNavigate()
  const locale = useLocaleStore((s) => s.locale)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const { data, isLoading, isError, refetch } = useRequests({ q: search || undefined, status: status || undefined })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('requests.title')}
        actions={<Button onClick={() => navigate('/requests/new')}><Plus className="size-4" /> {t('requests.new')}</Button>}
        filters={
          <>
            <Input className="max-w-72" placeholder={t('requests.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('ui.common.all')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorState title={t('error.generic')} onRetry={() => refetch()} retryLabel={t('ui.common.retry')} />
      ) : data && data.length === 0 ? (
        <EmptyState title={t('requests.empty')} action={t('requests.new')} onAction={() => navigate('/requests/new')} />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>{t('field.title')}</TH>
              <TH>{t('requests.organizer')}</TH>
              <TH className="text-right">{t('requests.attendees')}</TH>
              <TH>{t('requests.type')}</TH>
              <TH>{t('requests.dates')}</TH>
              <TH>{t('status.DRAFT').replace(/.*/, 'Status')}</TH>
            </TR>
          </THead>
          <tbody>
            {(data ?? []).map((r) => (
              <TR key={r.id} className="cursor-pointer" onClick={() => navigate(`/requests/${r.id}`)}>
                <TD className="font-[550] text-text-primary">{r.title}</TD>
                <TD>{r.organizerName}</TD>
                <TD className="text-right font-mono tabular-nums">{r.expectedAttendees}</TD>
                <TD>{r.eventType}</TD>
                <TD className="font-mono text-[12px]">{formatDate(r.preferredDates[0]?.start, locale)}</TD>
                <TD><StatusBadge status={r.status} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
