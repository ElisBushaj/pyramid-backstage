import { APIError } from './api-error'
import { useLocaleStore } from '@/stores/locale'
import type { ErrorEnvelope, ServiceResponse, Paginated } from './types/_envelope'

/** ops-core base, e.g. http://localhost:4000/api/v1. */
const BASE_URL = import.meta.env.VITE_OPS_CORE_URL ?? '/api/v1'

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  headers?: Record<string, string>
  /** When true, attach a fresh UUID v4 `Idempotency-Key` (mutations). */
  idempotency?: boolean
  signal?: AbortSignal
}

// Indirection so tests (or SSR-less edge cases) can swap the locale source
// without importing the zustand store.
let localeProvider: () => string = () => useLocaleStore.getState().locale

export function setLocaleProvider(fn: () => string) {
  localeProvider = fn
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]!) : undefined
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Accept-Language': localeProvider(),
    ...(opts.headers ?? {}),
  }

  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (opts.idempotency) {
    headers['Idempotency-Key'] = crypto.randomUUID()
  }

  // Double-submit CSRF: echo the readable pb_csrf cookie on unsafe methods
  // (the server sets it at login — see middlewares/csrf.middleware.ts).
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie('pb_csrf')
    if (csrf) headers['x-csrf-token'] = csrf
  }

  const response = await fetch(buildUrl(path, opts.query), {
    method,
    credentials: 'include',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const envelope = (payload ?? {}) as Partial<ErrorEnvelope>
    throw new APIError({
      status: envelope.status ?? response.status,
      error: envelope.error ?? 'internal',
      message: envelope.message ?? response.statusText,
      messageKey: envelope.messageKey,
      conflicts: envelope.conflicts,
      from: envelope.from,
      to: envelope.to,
      fields: envelope.fields,
    })
  }

  // A 2xx with an empty/non-JSON body (payload === null) has no envelope — return
  // undefined rather than dereferencing null.data, which would throw a TypeError.
  if (payload === null) return undefined as T
  const envelope = payload as ServiceResponse<T>
  return envelope.data
}

function errorFrom(payload: unknown, status: number, statusText: string): APIError {
  const envelope = (payload ?? {}) as Partial<ErrorEnvelope>
  return new APIError({
    status: envelope.status ?? status,
    error: envelope.error ?? 'internal',
    message: envelope.message ?? statusText,
    messageKey: envelope.messageKey,
    conflicts: envelope.conflicts,
    from: envelope.from,
    to: envelope.to,
    fields: envelope.fields,
  })
}

/**
 * GET an okList route, preserving the sibling pagination meta the server sends
 * (total/page/pageSize/totalPages) instead of discarding it like `get` does
 * (ADR-0017 / XC-3). Returns the full Paginated<T>.
 */
async function requestList<T>(path: string, opts: Omit<RequestOptions, 'body'> = {}): Promise<Paginated<T>> {
  const response = await fetch(buildUrl(path, opts.query), {
    method: 'GET',
    credentials: 'include',
    headers: { 'Accept-Language': localeProvider(), ...(opts.headers ?? {}) },
    signal: opts.signal,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw errorFrom(payload, response.status, response.statusText)
  const env = (payload ?? {}) as ServiceResponse<T[]> & Partial<Paginated<T>>
  const data = (env.data ?? []) as T[]
  const pageSize = env.pageSize ?? (data.length || 1)
  const total = env.total ?? data.length
  return {
    data,
    total,
    page: env.page ?? 1,
    pageSize,
    totalPages: env.totalPages ?? Math.max(1, Math.ceil(total / pageSize)),
  }
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, opts),
  getList: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    requestList<T>(path, opts),
  post: <T>(path: string, opts?: RequestOptions) =>
    request<T>('POST', path, opts),
  patch: <T>(path: string, opts?: RequestOptions) =>
    request<T>('PATCH', path, opts),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, opts),
}
