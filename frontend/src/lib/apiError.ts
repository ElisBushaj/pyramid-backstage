import { APIError } from '@/api/api-error'
import { useToast, type ToastTone } from '@/components/ui/Toast'
import { useT } from '@/i18n/useT'

type T = (key: string, params?: Record<string, string | number>) => string

/**
 * field → localized message, derived from a 422 APIError's `fields` map
 * ({ field: messageKey }). Empty for any non-422 / non-APIError (XC-4).
 */
export function fieldErrorsFrom(err: unknown, t: T): Record<string, string> {
  if (!(err instanceof APIError) || !err.fields) return {}
  const out: Record<string, string> = {}
  for (const [field, key] of Object.entries(err.fields)) out[field] = t(key)
  return out
}

interface ToastSpec {
  tone: ToastTone
  messageKey: string
}

/** Map any thrown error to a toast spec, branching on the APIError status. */
export function toMutationToast(err: unknown): ToastSpec {
  if (err instanceof APIError) {
    switch (err.status) {
      case 422:
        return { tone: 'warning', messageKey: 'error.checkFields' }
      case 403:
        return { tone: 'danger', messageKey: 'error.forbidden' }
      case 429:
        return { tone: 'warning', messageKey: 'error.rateLimited' }
      case 410:
        return { tone: 'warning', messageKey: 'error.holdExpired' }
    }
  }
  return { tone: 'danger', messageKey: 'error.generic' }
}

/**
 * Returns an `onError` callback that raises a toast mapped from the error's
 * status (422 → check fields, 403 → forbidden, 429 → rate-limited, 410 → re-hold,
 * else → generic). The single shared mutation-error surface (XC-4).
 */
export function useMutationToast() {
  const { toast } = useToast()
  const t = useT()
  return (err: unknown) => {
    const { tone, messageKey } = toMutationToast(err)
    toast({ tone, title: t('error.title'), message: t(messageKey) })
  }
}
