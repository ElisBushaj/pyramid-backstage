import { prisma } from "../../config/prisma";
import { okList, type ListResponse } from "../../types";
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
  page?: number;
  pageSize?: number;
  /** Default "asc" preserves the oldest-first history-reconstruction semantic (F09);
   *  the dashboard recent-activity slice passes "desc" for newest-first. (ADR-0017) */
  order?: "asc" | "desc";
}

class AuditService {
  /** Decision/change history, oldest-first by default. Filters combine with AND. Bounded (ADR-0017). */
  async list(p: AuditQuery): Promise<ListResponse<AuditEntry>> {
    const page = Math.max(1, p.page ?? 1);
    const pageSize = Math.min(Math.max(1, p.pageSize ?? 50), 100);
    const where = {
      ...(p.requestId ? { requestId: p.requestId } : {}),
      ...(p.entityType ? { entityType: p.entityType } : {}),
    };
    const [rows, total] = await prisma.$transaction([
      prisma.auditEntry.findMany({ where, orderBy: { at: p.order ?? "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.auditEntry.count({ where }),
    ]);
    return okList(rows.map(auditToDto), total, page, pageSize, "audit.list.success");
  }
}

export const auditService = new AuditService();
