import { useState } from 'react'
import { useRequests, useTasks } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Input'
import { Card, CardBody } from '@/components/ui/Card'
import { TaskBoard } from '@/components/command/TaskBoard'
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback'

export default function Tasks() {
  const t = useT()
  const { data: requests } = useRequests({ pageSize: 100 })
  const withPlans = (requests ?? []).filter((r) => r.status !== 'DRAFT')
  const [selected, setSelected] = useState('')
  const reqId = selected || withPlans[0]?.id
  const { data: tasks, isLoading } = useTasks(reqId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.tasks')}
        filters={
          <Select className="w-72" value={reqId ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {withPlans.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </Select>
        }
      />
      <Card>
        <CardBody>
          {!reqId ? <EmptyState title={t('tasks.empty')} /> : isLoading ? <LoadingBlock rows={3} /> : tasks && tasks.length ? <TaskBoard tasks={tasks} /> : <EmptyState title={t('tasks.empty')} />}
        </CardBody>
      </Card>
    </div>
  )
}
