/**
 * Mirrors ops-core/src/types/index.ts (ServiceResponse / Paginated) and
 * docs/04-api/ERROR_CONTRACT.md. The YAML contract is the source of truth;
 * this file is the verbatim TS mirror the frontend consumes. Additive-only.
 */

/** Success envelope. `data` is the typed payload `T`; the client unwraps it. */
export interface ServiceResponse<T = unknown> {
  status: 'OK'
  message: string
  messageKey: string
  data: T
}

/** Paginated list payload — the `T` inside a ServiceResponse for list routes. */
export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type PaginatedServiceResponse<T> = ServiceResponse<Paginated<T>>

/** A single overlap/over-allocation reason — mirrors schemas/Conflict. */
export type ConflictType =
  | 'SPACE_DOUBLE_BOOKED'
  | 'ASSET_OVERALLOCATED'
  | 'SETUP_WINDOW_OVERLAP'

export interface DateRange {
  start: string // RFC-3339 UTC
  end: string
}

export interface Conflict {
  type: ConflictType
  spaceId?: string
  assetId?: string
  requested?: number
  available?: number
  conflictingRequestIds?: string[]
  window: DateRange
  detail: string
}

/**
 * Error envelope. Every error path returns this shape (see ERROR_CONTRACT.md).
 * `error` is the canonical machine string the agent/UI branches on; the extra
 * fields ride per error kind:
 *   conflict           → conflicts
 *   invalid_transition → from, to
 *   validation         → fields ({ <field>: <messageKey> })
 */
export interface ErrorEnvelope {
  status: number
  error: string
  message?: string
  messageKey?: string
  conflicts?: Conflict[]
  from?: string
  to?: string
  fields?: Record<string, string>
}
