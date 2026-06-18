import { APIError } from './api-error'
import { useLocaleStore } from '@/stores/locale'
import type { ErrorEnvelope, ServiceResponse } from './types/_envelope'

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

  const envelope = payload as ServiceResponse<T>
  return envelope.data
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('GET', path, opts),
  post: <T>(path: string, opts?: RequestOptions) =>
    request<T>('POST', path, opts),
  patch: <T>(path: string, opts?: RequestOptions) =>
    request<T>('PATCH', path, opts),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) =>
    request<T>('DELETE', path, opts),
}
