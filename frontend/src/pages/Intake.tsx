import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Info } from 'lucide-react'
import { useCreateRequest } from '@/api/hooks'
import { APIError } from '@/api/api-error'
import { useT } from '@/i18n/useT'
import type { EventRequestInput } from '@/api/types/requests'
import type { Layout } from '@/api/types/spaces'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Switch } from '@/components/ui/Switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs'
import { CopilotPanel, type ChatMessageData } from '@/components/command/CopilotPanel'

const EVENT_TYPES: EventRequestInput['eventType'][] = [
  'CONFERENCE',
  'EXHIBITION',
  'WORKSHOP',
  'PERFORMANCE',
  'COMMUNITY',
  'PRIVATE',
  'OTHER',
]
const LAYOUTS: Layout[] = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION', 'CABARET', 'BOARDROOM', 'CUSTOM']

type FormState = {
  title: string
  organizerName: string
  contactEmail: string
  contactPhone: string
  expectedAttendees: string
  eventType: EventRequestInput['eventType']
  layout: Layout
  start: string
  end: string
  avNeeded: boolean
  cateringNeeded: boolean
  notes: string
}

const REQUIRED_FIELDS: (keyof FormState)[] = ['title', 'organizerName', 'expectedAttendees', 'start', 'end']

export default function Intake() {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateRequest()
  const apiErr = create.error instanceof APIError ? create.error : undefined

  const [tab, setTab] = useState<'form' | 'chat'>('form')
  const [touched, setTouched] = useState(false)
  const [form, setForm] = useState<FormState>({
    title: '',
    organizerName: '',
    contactEmail: '',
    contactPhone: '',
    expectedAttendees: '',
    eventType: 'CONFERENCE',
    layout: 'THEATER',
    start: '',
    end: '',
    avNeeded: false,
    cateringNeeded: false,
    notes: '',
  })
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  // Client-side required-field errors surface after a submit attempt; server-side
  // 422 field errors ride alongside. Map both to specific, localized copy.
  const clientErrors = useMemo<Partial<Record<keyof FormState, string>>>(() => {
    if (!touched) return {}
    const errs: Partial<Record<keyof FormState, string>> = {}
    for (const f of REQUIRED_FIELDS) {
      if (!String(form[f]).trim()) errs[f] = t(`intake.required.${f}`)
    }
    return errs
  }, [touched, form, t])

  const fieldError = (formKey: keyof FormState, apiKey?: string): string | undefined => {
    if (clientErrors[formKey]) return clientErrors[formKey]
    if (apiKey && apiErr?.fieldError(apiKey)) return t(`intake.invalid.${formKey}`)
    return undefined
  }

  const invalidCount = Object.keys(clientErrors).length + (apiErr?.fields ? Object.keys(apiErr.fields).length : 0)
  const subtitle = invalidCount > 0 ? t('requests.intakeFixField') : t('requests.intakeSubtitle')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const missing = REQUIRED_FIELDS.some((f) => !String(form[f]).trim())
    if (missing) return

    const body: EventRequestInput = {
      title: form.title.trim(),
      organizerName: form.organizerName.trim(),
      contactEmail: form.contactEmail.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      expectedAttendees: Number(form.expectedAttendees),
      eventType: form.eventType,
      preferredDates: [
        { start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString() },
      ],
      requirements: {
        layout: form.layout,
        avNeeded: form.avNeeded,
        cateringNeeded: form.cateringNeeded,
        notes: form.notes.trim() || undefined,
      },
    }
    create.mutate(body, { onSuccess: (r) => navigate(`/requests/${r.id}`) })
  }

  const seededTurns: ChatMessageData[] = [
    { role: 'user', text: t('intake.chatSeedUser') },
    { role: 'assistant', text: t('intake.chatSeedAssistant') },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t('nav.pipeline'), t('requests.new')]}
        title={t('requests.intakeTitle')}
        subtitle={subtitle}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'form' | 'chat')}>
        <TabsList aria-label={t('requests.intakeTitle')}>
          <TabsTrigger value="form">{t('intake.tabForm')}</TabsTrigger>
          <TabsTrigger value="chat">{t('intake.tabChat')}</TabsTrigger>
        </TabsList>

        {/* FORM — the working path */}
        <TabsContent value="form" className="pt-6">
          <Card className="max-w-[680px] p-6 sm:p-7">
            <p className="mb-4 text-[12px] font-[600] uppercase tracking-[0.04em] text-text-tertiary">
              {t('intake.eyebrow')}
            </p>

            <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
              <FormField
                className="sm:col-span-2"
                label={t('field.title')}
                htmlFor="intake-title"
                error={fieldError('title', 'title')}
              >
                <Input
                  id="intake-title"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder={t('intake.titlePlaceholder')}
                  invalid={!!fieldError('title', 'title')}
                />
              </FormField>

              <FormField
                label={t('field.organizerName')}
                htmlFor="intake-organizer"
                error={fieldError('organizerName', 'organizerName')}
              >
                <Input
                  id="intake-organizer"
                  value={form.organizerName}
                  onChange={(e) => set('organizerName', e.target.value)}
                  placeholder={t('intake.organizerPlaceholder')}
                  invalid={!!fieldError('organizerName', 'organizerName')}
                />
              </FormField>

              <FormField
                label={t('field.expectedAttendees')}
                htmlFor="intake-attendees"
                error={fieldError('expectedAttendees', 'expectedAttendees')}
              >
                <Input
                  id="intake-attendees"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="font-mono tabular-nums"
                  value={form.expectedAttendees}
                  onChange={(e) => set('expectedAttendees', e.target.value)}
                  placeholder={t('intake.attendeesPlaceholder')}
                  suffix={t('intake.pax')}
                  invalid={!!fieldError('expectedAttendees', 'expectedAttendees')}
                />
              </FormField>

              <FormField label={t('field.contactEmail')} htmlFor="intake-email">
                <Input
                  id="intake-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => set('contactEmail', e.target.value)}
                  placeholder={t('intake.emailPlaceholder')}
                />
              </FormField>

              <FormField label={t('field.contactPhone')} htmlFor="intake-phone">
                <Input
                  id="intake-phone"
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => set('contactPhone', e.target.value)}
                  placeholder={t('intake.phonePlaceholder')}
                />
              </FormField>

              <FormField label={t('field.eventType')} htmlFor="intake-type">
                <Select
                  id="intake-type"
                  value={form.eventType}
                  onChange={(e) => set('eventType', e.target.value as EventRequestInput['eventType'])}
                >
                  {EVENT_TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`eventType.${x}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label={t('field.layout')} htmlFor="intake-layout">
                <Select
                  id="intake-layout"
                  value={form.layout}
                  onChange={(e) => set('layout', e.target.value as Layout)}
                >
                  {LAYOUTS.map((x) => (
                    <option key={x} value={x}>
                      {t(`layout.${x}`)}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField
                label={t('field.preferredStart')}
                htmlFor="intake-start"
                error={fieldError('start', 'preferredDates')}
              >
                <Input
                  id="intake-start"
                  type="datetime-local"
                  className="font-mono tabular-nums"
                  value={form.start}
                  onChange={(e) => set('start', e.target.value)}
                  invalid={!!fieldError('start', 'preferredDates')}
                />
              </FormField>

              <FormField
                label={t('field.preferredEnd')}
                htmlFor="intake-end"
                error={fieldError('end', 'preferredDates')}
              >
                <Input
                  id="intake-end"
                  type="datetime-local"
                  className="font-mono tabular-nums"
                  value={form.end}
                  onChange={(e) => set('end', e.target.value)}
                  invalid={!!fieldError('end', 'preferredDates')}
                />
              </FormField>

              <FormField className="sm:col-span-2" label={t('field.notes')} htmlFor="intake-notes">
                <Textarea
                  id="intake-notes"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder={t('intake.notesPlaceholder')}
                />
              </FormField>

              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 sm:col-span-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-text-secondary">
                  <Switch checked={form.avNeeded} onCheckedChange={(v) => set('avNeeded', v)} />
                  {t('field.avNeeded')}
                </label>
                <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-text-secondary">
                  <Switch
                    checked={form.cateringNeeded}
                    onCheckedChange={(v) => set('cateringNeeded', v)}
                  />
                  {t('field.cateringNeeded')}
                </label>
              </div>

              <div className="mt-1 flex flex-wrap justify-end gap-2.5 sm:col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate('/requests')}
                  disabled={create.isPending}
                >
                  {t('ui.common.cancel')}
                </Button>
                <Button type="submit" loading={create.isPending}>
                  {create.isPending ? t('requests.creating') : t('requests.createAndPlan')}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        {/* CHAT — degrades to a clearly-non-live panel; POST /chat is not running */}
        <TabsContent value="chat" className="pt-6">
          <div className="flex max-w-[680px] flex-col gap-3">
            <div className="flex items-start gap-2.5 rounded-control border border-border-subtle bg-surface-subtle px-3.5 py-3 text-[13px] leading-[19px] text-text-secondary">
              <Info className="mt-px size-4 shrink-0 text-text-tertiary" strokeWidth={1.8} aria-hidden />
              <span>{t('copilot.unavailable')}</span>
            </div>
            <CopilotPanel
              state="idle"
              messages={seededTurns}
              stateLabel={t('intake.chatOffline')}
              className="w-full"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
