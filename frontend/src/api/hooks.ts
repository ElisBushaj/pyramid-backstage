import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import { aiPlan, aiConfigured } from './ai'
import type { OperationalPlan } from './types/ai'
import type { User, UserInput } from './types/auth'
import type { Space, SpaceInput, SpaceWithAvailability, SpaceAvailability } from './types/spaces'
import type { Asset, AssetInput, AssetWithAvailability, AssetMovement, AssetScanInput, AssetScanResult } from './types/assets'
import type { EventRequest, EventRequestInput, RequestAggregate, DashboardStats } from './types/requests'
import type { Reservation, ReservationInput } from './types/reservations'
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
export const useRequests = (params: Query) =>
  useQuery({ queryKey: q('requests', params), queryFn: () => api.get<EventRequest[]>('/private/requests', { query: { pageSize: 100, ...params } }) })

export const useRequest = (id?: string) =>
  useQuery({ queryKey: q('request', id), queryFn: () => api.get<RequestAggregate>(`/private/requests/${id}`), enabled: !!id })

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

export function usePersistTasks(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tasks: TaskInput[]) => api.post<Task[]>(`/private/requests/${requestId}/tasks`, { body: { tasks }, idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); qc.invalidateQueries({ queryKey: q('tasks', requestId) }) },
  })
}

export function useUpdateTask(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TaskUpdateInput }) => api.patch<Task>(`/private/tasks/${id}`, { body, idempotency: true }),
    onSuccess: () => { invalidateRequest(qc, requestId); qc.invalidateQueries({ queryKey: q('tasks', requestId) }) },
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
export const useAssetMovements = (id?: string) =>
  useQuery({ queryKey: q('asset-movements', id), queryFn: () => api.get<AssetMovement[]>(`/private/assets/${id}/movements`), enabled: !!id })

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

export const useConflicts = (params: Query, enabled = true) =>
  useQuery({ queryKey: q('conflicts', params), queryFn: () => api.get<Conflict[]>('/private/conflicts', { query: params }), enabled })

// ── audit ────────────────────────────────────────────────────────────────────
export const useAudit = (params: Query) =>
  useQuery({ queryKey: q('audit', params), queryFn: () => api.get<AuditEntry[]>('/private/audit', { query: params }) })

// ── admin users ──────────────────────────────────────────────────────────────
export const useUsers = () => useQuery({ queryKey: q('users'), queryFn: () => api.get<User[]>('/admin/users') })

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
    mutationFn: ({ id, body }: { id: string; body: Partial<UserInput> }) => api.patch<User>(`/admin/users/${id}`, { body, idempotency: false }),
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
