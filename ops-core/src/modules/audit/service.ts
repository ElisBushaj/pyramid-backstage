import { prisma } from "../../config/prisma";
import { ok, type ServiceResponse } from "../../types";
import type { AuditEntry } from "../../types/api/audit";

export function auditToDto(row: {
  id: string; actorId: string | null; actorName: string | null; action: string;
  entityType: string; entityId: string; requestId: string | null;
  before: unknown; after: unknown; reason: string | null; at: Date;
}): AuditEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    requestId: row.requestId,
    before: (row.before ?? null) as AuditEntry["before"],
    after: (row.after ?? null) as AuditEntry["after"],
    reason: row.reason,
    at: row.at.toISOString(),
  };
}

interface AuditQuery {
  requestId?: string;
  entityType?: string;
}

class AuditService {
  /** Decision/change history, oldest-first. Filters combine with AND. */
  async list(p: AuditQuery): Promise<ServiceResponse<AuditEntry[]>> {
    const rows = await prisma.auditEntry.findMany({
      where: {
        ...(p.requestId ? { requestId: p.requestId } : {}),
        ...(p.entityType ? { entityType: p.entityType } : {}),
      },
      orderBy: { at: "asc" },
    });
    return ok(rows.map(auditToDto), "audit.list.success");
  }
}

export const auditService = new AuditService();
