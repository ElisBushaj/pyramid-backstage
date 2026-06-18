// Mirrors ops-core/src/types/api/audit.ts.
export interface AuditEntry {
  id: string
  actorId?: string | null
  actorName?: string | null
  action: string
  entityType: string
  entityId: string
  requestId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  reason?: string | null
  at: string
}
