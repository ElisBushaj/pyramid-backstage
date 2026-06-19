import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateRequest } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import type { EventRequestInput } from '@/api/types/requests'
import type { Layout } from '@/api/types/spaces'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

const EVENT_TYPES = ['CONFERENCE', 'EXHIBITION', 'WORKSHOP', 'PERFORMANCE', 'COMMUNITY', 'PRIVATE', 'OTHER']
const LAYOUTS = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION', 'CABARET', 'BOARDROOM', 'CUSTOM']

export default function Intake() {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateRequest()
  const err = create.error instanceof APIError ? create.error : undefined
  const fieldError = (f: string) => (err?.fieldError(f) ? t('error.generic') : undefined)

  const [form, setForm] = useState({
    title: '', organizerName: '', contactEmail: '', contactPhone: '', expectedAttendees: '100',
    eventType: 'CONFERENCE', layout: 'THEATER', start: '', end: '', avNeeded: false, cateringNeeded: false, notes: '',
  })
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const body: EventRequestInput = {
      title: form.title,
      organizerName: form.organizerName,
      contactEmail: form.contactEmail || undefined,
      contactPhone: form.contactPhone || undefined,
      expectedAttendees: Number(form.expectedAttendees),
      eventType: form.eventType as EventRequestInput['eventType'],
      preferredDates: [{ start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString() }],
      requirements: { layout: form.layout as Layout, avNeeded: form.avNeeded, cateringNeeded: form.cateringNeeded, notes: form.notes || undefined },
    }
    create.mutate(body, { onSuccess: (r) => navigate(`/requests/${r.id}`) })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('requests.intakeTitle')} subtitle={t('requests.intakeSubtitle')} />
      <Card>
        <CardBody>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <FormField className="sm:col-span-2" label={t('field.title')} error={fieldError('title')}>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} invalid={!!err?.fieldError('title')} required />
            </FormField>
            <FormField label={t('field.organizerName')} error={fieldError('organizerName')}>
              <Input value={form.organizerName} onChange={(e) => set('organizerName', e.target.value)} required />
            </FormField>
            <FormField label={t('field.expectedAttendees')} error={fieldError('expectedAttendees')}>
              <Input type="number" min={1} value={form.expectedAttendees} onChange={(e) => set('expectedAttendees', e.target.value)} required />
            </FormField>
            <FormField label={t('field.contactEmail')}>
              <Input type="email" value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            </FormField>
            <FormField label={t('field.contactPhone')}>
              <Input value={form.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </FormField>
            <FormField label={t('field.eventType')}>
              <Select value={form.eventType} onChange={(e) => set('eventType', e.target.value)}>
                {EVENT_TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </FormField>
            <FormField label={t('field.layout')}>
              <Select value={form.layout} onChange={(e) => set('layout', e.target.value)}>
                {LAYOUTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </FormField>
            <FormField label={t('field.preferredStart')} error={fieldError('preferredDates')}>
              <Input type="datetime-local" value={form.start} onChange={(e) => set('start', e.target.value)} required />
            </FormField>
            <FormField label={t('field.preferredEnd')}>
              <Input type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} required />
            </FormField>
            <FormField className="sm:col-span-2" label={t('field.notes')}>
              <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </FormField>
            <div className="flex items-center gap-5 sm:col-span-2">
              <label className="flex items-center gap-2 text-[13px] text-text-secondary"><input type="checkbox" checked={form.avNeeded} onChange={(e) => set('avNeeded', e.target.checked)} /> {t('field.avNeeded')}</label>
              <label className="flex items-center gap-2 text-[13px] text-text-secondary"><input type="checkbox" checked={form.cateringNeeded} onChange={(e) => set('cateringNeeded', e.target.checked)} /> {t('field.cateringNeeded')}</label>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => navigate('/requests')}>{t('ui.common.cancel')}</Button>
              <Button type="submit" loading={create.isPending}>{create.isPending ? t('requests.creating') : t('requests.create')}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
