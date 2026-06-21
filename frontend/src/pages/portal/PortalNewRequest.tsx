import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useCreateRequest } from '@/api/hooks'
import { useT } from '@/i18n/useT'
import { fieldErrorsFrom } from '@/lib/apiError'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Select } from '@/components/ui/Select'
import { Switch } from '@/components/ui/Switch'
import type { EventRequestInput } from '@/api/types/requests'
import type { Layout } from '@/api/types/spaces'

const EVENT_TYPES = ['CONFERENCE', 'EXHIBITION', 'WORKSHOP', 'PERFORMANCE', 'COMMUNITY', 'PRIVATE', 'OTHER']
const LAYOUTS = ['THEATER', 'CLASSROOM', 'BANQUET', 'RECEPTION', 'CABARET', 'BOARDROOM', 'CUSTOM']

export default function PortalNewRequest() {
  const t = useT()
  const navigate = useNavigate()
  const create = useCreateRequest()

  const [title, setTitle] = useState('')
  const [organizerName, setOrganizerName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [attendees, setAttendees] = useState('')
  const [eventType, setEventType] = useState('CONFERENCE')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [layout, setLayout] = useState('')
  const [avNeeded, setAvNeeded] = useState(false)
  // Per-field server (422) errors, keyed by the API field path; merged with the
  // client-side range check below so a field highlights regardless of source.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  // End must be strictly after start; surface inline (and block submit) before the round-trip.
  const rangeInvalid = !!start && !!end && new Date(start).getTime() >= new Date(end).getTime()
  const valid = !!title.trim() && !!organizerName.trim() && Number(attendees) >= 1 && !!start && !!end && !rangeInvalid

  // The end-date field shows the local range error first, then any server-side date error.
  const endError = rangeInvalid ? t('portal.endAfterStart') : fieldErrors.preferredDates

  function submit() {
    if (!valid) {
      setErr(t('intake.required'))
      return
    }
    setErr(null)
    setFieldErrors({})
    const input: EventRequestInput = {
      title: title.trim(),
      organizerName: organizerName.trim(),
      contactEmail: contactEmail.trim() || undefined,
      expectedAttendees: Number(attendees),
      eventType: eventType as EventRequestInput['eventType'],
      preferredDates: [{ start: new Date(start).toISOString(), end: new Date(end).toISOString() }],
      requirements: layout || avNeeded ? { layout: (layout || undefined) as Layout | undefined, avNeeded } : undefined,
    }
    create.mutate(input, {
      onSuccess: () => navigate('/portal'),
      onError: (e) => {
        const fields = fieldErrorsFrom(e, t)
        setFieldErrors(fields)
        // Keep a generic fallback banner when the 422 carried no field map (or it was a non-422).
        setErr(Object.keys(fields).length === 0 ? t('error.generic') : null)
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[22px] font-[650] text-text-primary">{t('portal.newRequest')}</h1>
        <p className="mt-1 text-[13px] text-text-tertiary">{t('portal.newRequestSub')}</p>
      </div>

      <div className="rounded-lg border border-border-subtle p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('portal.fTitle')} htmlFor="title" error={fieldErrors.title}><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('intake.titlePlaceholder')} /></FormField>
          <FormField label={t('portal.fOrganizer')} htmlFor="org" error={fieldErrors.organizerName}><Input id="org" value={organizerName} onChange={(e) => setOrganizerName(e.target.value)} placeholder={t('intake.organizerPlaceholder')} /></FormField>
          <FormField label={t('portal.fEmail')} htmlFor="email" error={fieldErrors.contactEmail}><Input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={t('intake.emailPlaceholder')} /></FormField>
          <FormField label={t('portal.fAttendees')} htmlFor="pax" error={fieldErrors.expectedAttendees}><Input id="pax" type="number" min={1} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder={t('intake.attendeesPlaceholder')} /></FormField>
          <FormField label={t('portal.fEventType')} error={fieldErrors.eventType}><Select value={eventType} onValueChange={setEventType} options={EVENT_TYPES.map((v) => ({ value: v, label: t(`eventType.${v}`) }))} /></FormField>
          <FormField label={t('portal.fLayout')}><Select value={layout} onValueChange={setLayout} placeholder={t('portal.layoutAny')} options={LAYOUTS.map((v) => ({ value: v, label: t(`layout.${v}`) }))} /></FormField>
          <FormField label={t('portal.fStart')} htmlFor="start"><Input id="start" type="datetime-local" lang="en-GB" className="[color-scheme:light]" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
          <FormField label={t('portal.fEnd')} htmlFor="end" error={endError}><Input id="end" type="datetime-local" lang="en-GB" className="[color-scheme:light]" value={end} onChange={(e) => setEnd(e.target.value)} /></FormField>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-md border border-border-subtle px-3.5 py-3">
          <div>
            <p className="text-[13px] font-[550] text-text-primary">{t('portal.fAv')}</p>
            <p className="text-[12px] text-text-tertiary">{t('portal.fAvSub')}</p>
          </div>
          <Switch checked={avNeeded} onCheckedChange={setAvNeeded} />
        </div>

        {err && <p role="alert" className="mt-4 rounded-control bg-danger-subtle px-3 py-2 text-[13px] text-danger">{err}</p>}

        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => navigate('/portal')}>{t('ui.common.cancel')}</Button>
          <Button loading={create.isPending} disabled={!valid} onClick={submit}>{t('portal.submit')}</Button>
        </div>
      </div>
    </div>
  )
}
