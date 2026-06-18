import { Prisma } from "@prisma/client";
import { APIError } from "../../errors";
import type { Actor } from "../../types";
import type { RequestStatus } from "../../types/api/requests";
import { writeAudit } from "../audit/audit.writer";

/**
 * The legal request lifecycle (REQUESTS.md):
 *   DRAFT → PROPOSED → APPROVED → SCHEDULED → COMPLETED
 *   any non-terminal → REJECTED
 * This is the SINGLE chokepoint for status changes — approvals/rejections reuse
 * it rather than duplicating the guard.
 */
export const LEGAL_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ["PROPOSED", "REJECTED"],
  PROPOSED: ["APPROVED", "REJECTED"],
  APPROVED: ["SCHEDULED", "REJECTED"],
  SCHEDULED: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
};

export function isLegalTransition(from: RequestStatus, to: RequestStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw 409 invalid_transition (carrying from/to) when the move is illegal. */
export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!isLegalTransition(from, to)) {
    throw APIError.invalidTransition(from, to, "request.invalid_transition");
  }
}

/**
 * Apply one guarded status change inside the caller's transaction, writing a
 * request.transition AuditEntry (before/after). Returns the updated row.
 */
export async function transitionRequest(
  tx: Prisma.TransactionClient,
  args: { id: string; from: RequestStatus; to: RequestStatus; actor: Actor; reason?: string | null },
) {
  assertTransition(args.from, args.to);
  const updated = await tx.eventRequest.update({
    where: { id: args.id },
    data: { status: args.to, ...(args.to === "REJECTED" && args.reason ? { rejectionReason: args.reason } : {}) },
  });
  await writeAudit(tx, {
    actor: args.actor,
    action: "request.transition",
    entityType: "EventRequest",
    entityId: args.id,
    requestId: args.id,
    before: { status: args.from },
    after: { status: args.to },
    reason: args.reason ?? null,
  });
  return updated;
}
