import type { Conflict } from './types/_envelope'

export interface APIErrorInit {
  status: number
  /** Canonical machine error string from the contract (e.g. "conflict"). */
  error: string
  message: string
  messageKey?: string
  /** Present on 409 conflict — the full set of offending overlaps. */
  conflicts?: Conflict[]
  /** Present on 409 invalid_transition. */
  from?: string
  to?: string
  /** Present on 422 validation — field → messageKey. */
  fields?: Record<string, string>
}

/**
 * Typed error thrown by the API client on any non-2xx response. Carries the
 * error-contract body so callers can branch on `error` and render the right
 * thing (inline field errors, a conflict explainer, etc.).
 */
export class APIError extends Error {
  readonly status: number
  readonly error: string
  readonly messageKey?: string
  readonly conflicts?: Conflict[]
  readonly from?: string
  readonly to?: string
  readonly fields?: Record<string, string>

  constructor(init: APIErrorInit) {
    super(init.message)
    this.name = 'APIError'
    this.status = init.status
    this.error = init.error
    this.messageKey = init.messageKey
    this.conflicts = init.conflicts
    this.from = init.from
    this.to = init.to
    this.fields = init.fields
  }

  /** The messageKey for a given field, if this is a 422 validation error. */
  fieldError(field: string): string | undefined {
    return this.fields?.[field]
  }
}
