import { Prisma } from "@prisma/client";

/**
 * Append a domain event to the OutboxEvent table inside the CALLER'S transaction
 * (AUDIT.md, ADR-0002). The relay (F11-T03) publishes unpublished rows to NATS.
 * No dual-write: the event commits atomically with the state change + audit row.
 * Subjects must match docs/02-domain/AUDIT.md exactly.
 */
export async function writeOutbox(
  tx: Prisma.TransactionClient,
  subject: string,
  payload: unknown,
): Promise<void> {
  await tx.outboxEvent.create({
    data: { subject, payload: JSON.parse(JSON.stringify(payload ?? {})) as Prisma.InputJsonValue },
  });
}
