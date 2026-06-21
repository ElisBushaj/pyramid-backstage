import { useMemo } from 'react'
import { useMutation, useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { aiPlan, aiConfigured } from './ai'
import type { OperationalPlan } from './types/ai'
import type { User, UserInput } from './types/auth'
import type { Space, SpaceInput, SpaceWithAvailability, SpaceAvailability } from './types/spaces'
import type { Asset, AssetInput, AssetWithAvailability, AssetMovement, AssetScanInput, AssetScanResult } from './types/assets'
import type { EventRequest, EventRequestInput, RequestAggregate, DashboardStats } from './types/requests'
import type { Reservation, ReservationInput, ScheduleEntry } from './types/reservations'
import type { Quote, LineItemInput } from './types/quotes'
import type { Task, TaskInput, TaskUpdateInput } from './types/tasks'
import type { Conflict } from './types/_envelope'
import type { AuditEntry } from './types/audit'

const q = (...parts: unknown[]) => parts
type Query = Record<string, string | number | boolean | undefined | null>

// ── auth ─────────────────────────────────────────────────────────────────────
export const useMe = () =>
  useQuery({ queryKey: q('me'), queryFn: () => api.get<User>('/private/auth/me'), retry: false, staleTime: 60_000 })

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api.post<User>('/public/auth/login', { body }),
    onSuccess: (user) => qc.setQueryData(q('me'), user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<null>('/private/auth/logout', { idempotency: false }),
    onSuccess: () => qc.clear(),
  })
}

// ── dashboard ────────────────────────────────────────────────────────────────
export const useDashboardStats = () =>
  useQuery({ queryKey: q('dashboard'), queryFn: () => api.get<DashboardStats>('/private/dashboard/stats') })

// ── requests ─────────────────────────────────────────────────────────────────
// Returns the Paginated envelope (data + total/page/pageSize/totalPages) so list
// pages can page + show "N of M" (ADR-0017). Consumers read `.data?.data` for the
// rows and `.data` for the meta.
export const useRequests = (params: Query = {}) =>
  useQuery({ queryKey: q('requests', params), queryFn: () => api.getList<EventRequest>('/private/requests', { query: { pageSize: 20, ...params } }) })

export const useRequest = (id?: string) =>
  useQuery({ queryKey: q('request', id), queryFn: () => api.get<RequestAggregate>(`/private/requests/${id}`), enabled: !!id })

// ── live bookings: which event currently holds which space (for the floor map) ──
// The requests LIST omits the reservation, so we resolve each request's aggregate.
// Cheap for a venue's worth of events; cached. Keyed by spaceId.
export interface SpaceBooking {
  spaceId: string
  requestId: string
  title: string
  status: string
  start: string
  end: string
}
export const useBookings = () =>
  useQuery({
    queryKey: q('bookings'),
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, SpaceBooking>> => {
      const requests = await api.get<EventRequest[]>('/private/requests', { query: { pageSize: 100 } })
      const aggs = await Promise.all(
        requests.map((r) => api.get<RequestAggregate>(`/private/requests/${r.id}`).catch(() => null)),
      )
      const out: Record<string, SpaceBooking> = {}
      requests.forEach((r, i) => {
        const res = aggs[i]?.reservation
        if (!res || (res.status !== 'HELD' && res.status !== 'CONFIRMED')) return
        // a HELD lease past its expiry is effectively free (the reaper just hasn't run)
        if (res.status === 'HELD' && res.expiresAt && Date.parse(res.expiresAt) < Date.now()) return
        if (out[res.spaceId]?.status === 'CONFIRMED' && res.status === 'HELD') return // keep firmest
        out[res.spaceId] = {
          spaceId: res.spaceId, requestId: r.id, title: r.title,
          status: res.status, start: res.dateRange.start, end: res.dateRange.end,
        }
      })
      return out
    },
  })

// F18 — the AI's deterministic OperationalPlan for a known request. Gated on a configured
// VITE_AI_URL; on error/unavailability the caller degrades to the ops-core-derived view.
export const usePlan = (requestId?: string) =>
  useQuery<OperationalPlan>({ queryKey: q('ai-plan', requestId), queryFn: () => aiPlan({ requestId: requestId! }), enabled: !!requestId && aiConfigured(), retry: false, staleTime: 30_000 })

export function useCreateRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: EventRequestInput) => api.post<EventRequest>('/private/requests', { body, idempotency: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: q('requests') }),
  })
}

export function useUpdateRequest(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<EventRequestInput>) => api.patch<EventRequest>(`/private/requests/${id}`, { body, idempotency: true }),
    onSuccess: () => invalidateRequest(qc, id),
  })
}

// ── reservations ─────────────────────────────────────────────────────────────
export function useHold(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: ReservationInput) => api.post<Reservation>('/private/reservations', { body, idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); invalidateInventoryViews(qc) },
  })
}

// ── quotes ───────────────────────────────────────────────────────────────────
export function useCreateQuote(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { requestId: string; reservationId?: string; extraLineItems?: LineItemInput[] }) => api.post<Quote>('/private/quotes', { body, idempotency: true }),
    onSuccess: () => invalidateRequest(qc, requestId),
  })
}

// ── tasks ────────────────────────────────────────────────────────────────────
export const useTasks = (requestId?: string) =>
  useQuery({ queryKey: q('tasks', requestId), queryFn: () => api.get<Task[]>(`/private/requests/${requestId}/tasks`), enabled: !!requestId })

export const useAllTasks = (requestIds: string[]) =>
  useQueries({
    queries: requestIds.map((id) => ({
      queryKey: q('tasks', id),
      queryFn: () => api.get<Task[]>(`/private/requests/${id}/tasks`),
    })),
    combine: (results) => ({
      data: results.flatMap((r) => r.data ?? []),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
      refetch: () => Promise.all(results.map((r) => r.refetch())),
    }),
  })

export function usePersistTasks(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tasks: TaskInput[]) => api.post<Task[]>(`/private/requests/${requestId}/tasks`, { body: { tasks }, idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); qc.invalidateQueries({ queryKey: q('tasks', requestId) }) },
  })
}

/**
 * Optimistic task status/assignee update. `requestId` rides in the mutate vars
 * (not the constructor) so the cross-event Tasks board — which holds tasks from
 * many requests — can update any card's owning request cache. Broadens the
 * invalidation to the whole q('tasks') prefix so the ALL-scope aggregate refreshes.
 */
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskUpdateInput; requestId: string }) =>
      api.patch<Task>(`/private/tasks/${id}`, { body, idempotency: true }),
    onMutate: async ({ id, body, requestId }) => {
      await qc.cancelQueries({ queryKey: q('tasks', requestId) })
      await qc.cancelQueries({ queryKey: q('request', requestId) })
      const prevTasks = qc.getQueryData<Task[]>(q('tasks', requestId))
      // The RequestDetail tasks tab reads the aggregate, not the per-request tasks
      // query — patch both so the status flips optimistically on either surface.
      const prevAgg = qc.getQueryData<RequestAggregate>(q('request', requestId))
      if (body.status) {
        const patch = (t: Task) => (t.id === id ? { ...t, status: body.status! } : t)
        if (prevTasks) qc.setQueryData<Task[]>(q('tasks', requestId), prevTasks.map(patch))
        if (prevAgg) qc.setQueryData<RequestAggregate>(q('request', requestId), { ...prevAgg, tasks: prevAgg.tasks.map(patch) })
      }
      return { prevTasks, prevAgg, requestId }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prevTasks) qc.setQueryData(q('tasks', ctx.requestId), ctx.prevTasks)
      if (ctx?.prevAgg) qc.setQueryData(q('request', ctx.requestId), ctx.prevAgg)
    },
    onSettled: (_d, _e, vars) => { invalidateRequest(qc, vars.requestId); qc.invalidateQueries({ queryKey: q('tasks') }) },
  })
}

// ── approvals ────────────────────────────────────────────────────────────────
export function useApprove(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<EventRequest>(`/private/requests/${requestId}/approve`, { idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); invalidateInventoryViews(qc) },
  })
}

export function useReject(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => api.post<EventRequest>(`/private/requests/${requestId}/reject`, { body: { reason }, idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); invalidateInventoryViews(qc) },
  })
}

// ── spaces / assets / conflicts ──────────────────────────────────────────────
export const useSpaces = (params: Query) =>
  useQuery({ queryKey: q('spaces', params), queryFn: () => api.get<SpaceWithAvailability[]>('/private/spaces', { query: params }) })

export const useSpaceAvailability = (id?: string, start?: string, end?: string) =>
  useQuery({ queryKey: q('space-avail', id, start, end), queryFn: () => api.get<SpaceAvailability>(`/private/spaces/${id}/availability`, { query: { start, end } }), enabled: !!id && !!start && !!end })

export const useAssets = (params: Query) =>
  useQuery({ queryKey: q('assets', params), queryFn: () => api.get<AssetWithAvailability[]>('/private/assets', { query: params }) })

export function useUpdateSpace(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<SpaceInput>) => api.patch<Space>(`/private/spaces/${id}`, { body, idempotency: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: q('spaces') }),
  })
}

export function useUpdateAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<AssetInput>) => api.patch<Asset>(`/private/assets/${id}`, { body, idempotency: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: q('assets') }),
  })
}

// ── F16: QR/NFC asset tracking ─────────────────────────────────────────────────
// Paginated ledger (ADR-0017): pass { page, pageSize }; reads `.data?.data` + meta.
export const useAssetMovements = (id?: string, params: Query = {}) =>
  useQuery({ queryKey: q('asset-movements', id, params), queryFn: () => api.getList<AssetMovement>(`/private/assets/${id}/movements`, { query: params }), enabled: !!id })

export function useScanAsset(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AssetScanInput) => api.post<AssetScanResult>(`/private/assets/${id}/scan`, { body, idempotency: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: q('asset-movements', id) })
      invalidateInventoryViews(qc)
    },
  })
}

/** A wide today±60d window — the default when a caller (Dashboard/AppShell) omits one. */
function defaultConflictWindow(): { start: string; end: string } {
  const now = Date.now()
  const span = 60 * 86_400_000
  return { start: new Date(now - span).toISOString(), end: new Date(now + span).toISOString() }
}

/**
 * GET /conflicts requires start+end. Callers that omit them (Dashboard, AppShell)
 * used to 422 on every page (XC-2); we default a wide window so the conflict alert,
 * FloorMap red-lighting, and the nav badge work everywhere. Memoized so the default
 * window stays stable across renders (no refetch storm).
 */
export const useConflicts = (params: Query, enabled = true) => {
  const query = useMemo(
    () => (params.start && params.end ? params : { ...params, ...defaultConflictWindow() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.start, params.end, params.spaceId, params.status],
  )
  return useQuery({ queryKey: q('conflicts', query), queryFn: () => api.get<Conflict[]>('/private/conflicts', { query }), enabled })
}

// ── schedule (ADR-0016: live reservation windows for the timelines) ─────────────
export const useSchedule = (params: Query, enabled = true) =>
  useQuery({
    queryKey: q('schedule', params),
    queryFn: () => api.get<ScheduleEntry[]>('/private/reservations', { query: params }),
    enabled: enabled && !!params.start && !!params.end,
  })

// ── audit ────────────────────────────────────────────────────────────────────
export const useAudit = (params: Query = {}) =>
  useQuery({ queryKey: q('audit', params), queryFn: () => api.getList<AuditEntry>('/private/audit', { query: params }) })

// ── admin users ──────────────────────────────────────────────────────────────
// ADMIN-gated so non-admins skip the 403 round-trip (XC-6); returns Paginated (ADR-0017).
export const useUsers = (params: Query = {}) => {
  const isAdmin = useMe().data?.role === 'ADMIN'
  return useQuery({ queryKey: q('users', params), queryFn: () => api.getList<User>('/admin/users', { query: params }), enabled: isAdmin })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UserInput) => api.post<User>('/admin/users', { body, idempotency: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: q('users') }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<UserInput> }) => api.patch<User>(`/admin/users/${id}`, { body, idempotency: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: q('users') }),
  })
}

function invalidateRequest(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: q('request', id) })
  qc.invalidateQueries({ queryKey: q('requests') })
}

// A booking-loop write (hold/approve/reject/scan) changes the live, server-computed
// conflict set + windowed availability; invalidate every derived view together so the
// always-mounted conflict badge, FloorMap and dashboard KPIs never go stale.
function invalidateInventoryViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: q('conflicts') })
  qc.invalidateQueries({ queryKey: q('spaces') })
  qc.invalidateQueries({ queryKey: q('assets') })
  qc.invalidateQueries({ queryKey: q('dashboard') })
}
