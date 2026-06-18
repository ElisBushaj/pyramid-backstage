import { Prisma } from "@prisma/client";
import type { Actor } from "../../types";

export interface AuditInput {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

function asJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  return JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
}

/**
 * Append one AuditEntry inside the CALLER'S transaction, so the record commits
 * (or rolls back) atomically with the mutation it describes — no second
 * transaction, no dual-write (CORE_PATTERNS, AUDIT.md). The `tx` must be the
 * Prisma.TransactionClient from the surrounding `$transaction`.
 *
 * Throws on a missing actor: a decision log without a real decider is worthless,
 * so we fail loud rather than write an anonymous row. requireAuth guarantees
 * req.actor on every /private path, so this only fires on a wiring bug.
 */
export async function writeAudit(tx: Prisma.TransactionClient, input: AuditInput) {
  if (!input.actor?.id) {
    throw new Error(`writeAudit: refusing anonymous audit for action "${input.action}" — req.actor is required`);
  }
  return tx.auditEntry.create({
    data: {
      actorId: input.actor.id,
      actorName: input.actor.name,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId ?? null,
      before: asJson(input.before),
      after: asJson(input.after),
      reason: input.reason ?? null,
    },
  });
}

/**
 * Audit a system-initiated change (the HELD-expiry reaper). No human actor, so
 * actorId is null and actorName is "system" — the one legitimate non-user actor.
 */
export async function writeSystemAudit(
  tx: Prisma.TransactionClient,
  input: Omit<AuditInput, "actor">,
) {
  return tx.auditEntry.create({
    data: {
      actorId: null,
      actorName: "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId ?? null,
      before: asJson(input.before),
      after: asJson(input.after),
      reason: input.reason ?? null,
    },
  });
}
