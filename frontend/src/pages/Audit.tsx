import { useState } from 'react'
import { useAudit } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Input } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { AuditTimeline } from '@/components/command/AuditTimeline'
import { LoadingBlock } from '@/components/ui/Feedback'

export default function Audit() {
  const t = useT()
  const [requestId, setRequestId] = useState('')
  const [entityType, setEntityType] = useState('')
  const { data, isLoading } = useAudit({ requestId: requestId || undefined, entityType: entityType || undefined })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('audit.title')}
        filters={
          <>
            <Input className="w-72" placeholder={t('audit.filterRequest')} value={requestId} onChange={(e) => setRequestId(e.target.value)} />
            <Input className="w-48" placeholder={t('audit.filterEntity')} value={entityType} onChange={(e) => setEntityType(e.target.value)} />
          </>
        }
      />
      <Card>
        <CardBody>{isLoading ? <LoadingBlock rows={5} /> : <AuditTimeline entries={data ?? []} />}</CardBody>
      </Card>
    </div>
  )
}
