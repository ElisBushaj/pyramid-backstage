import type { Role } from '@/api/types/auth'
import { useMe } from '@/api/hooks'

/**
 * Client mirror of the ops-core RBAC ladder (auth.middleware RANK) and the
 * requireRole floors on each route. Keep in lockstep with the server guards —
 * this gates *visibility*; the server 403 stays the real boundary (XC-6).
 */
const RANK: Record<Role, number> = { PARTNER: -1, VIEWER: 0, OPS: 1, MANAGER: 2, ADMIN: 3 }

export type Action =
  | 'approve' // POST /requests/:id/{approve,reject} — MANAGER+
  | 'scanAsset' // POST /assets/:id/scan — OPS+
  | 'manageInventory' // PATCH /assets/:id — OPS+
  | 'manageSpaces' // PATCH /spaces/:id — OPS+
  | 'hold' // POST /reservations — OPS+
  | 'manageUsers' // /admin/* — ADMIN

const FLOOR: Record<Action, Role> = {
  approve: 'MANAGER',
  scanAsset: 'OPS',
  manageInventory: 'OPS',
  manageSpaces: 'OPS',
  hold: 'OPS',
  manageUsers: 'ADMIN',
}

/** True when `role` clears the floor for `action`. Unknown/absent role → false. */
export function can(role: Role | undefined | null, action: Action): boolean {
  if (role == null) return false
  return RANK[role] >= RANK[FLOOR[action]]
}

/** Hook form: `const can = useCan(); …can('approve')`. Reads the current session role. */
export function useCan(): (action: Action) => boolean {
  const role = useMe().data?.role
  return (action: Action) => can(role, action)
}
