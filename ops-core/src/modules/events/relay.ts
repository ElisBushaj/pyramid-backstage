import { prisma } from "../../config/prisma";
import { vars } from "../../config/vars";
import { logger } from "../../config/logger";
import { publishEvent } from "../../config/nats";

export type Publisher = (subject: string, payload: unknown) => Promise<boolean>;

/**
 * One relay pass (F11-T03): publish unpublished OutboxEvents in createdAt order,
 * marking publishedAt only after a successful publish ack. At-least-once — a
 * crash between publish and mark re-publishes next pass (consumers are
 * idempotent). A row is never marked published without an ack. The publisher is
 * injectable for tests; in production it is the JetStream publisher.
 */
export async function runRelayPass(publisher: Publisher = publishEvent, batchSize = 200): Promise<number> {
  if (!vars.natsEnabled && publisher === publishEvent) return 0; // disabled → inert, rows accumulate
  const rows = await prisma.outboxEvent.findMany({ where: { publishedAt: null }, orderBy: { createdAt: "asc" }, take: batchSize });
  let published = 0;
  for (const row of rows) {
    const acked = await publisher(row.subject, row.payload);
    if (acked) {
      await prisma.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date() } });
      published++;
    }
  }
  return published;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startRelay(intervalMs = 1000): void {
  if (!vars.natsEnabled) return;
  stopRelay();
  timer = setInterval(() => {
    void runRelayPass().catch((err) => logger.error({ err }, "[relay] pass failed"));
  }, intervalMs);
  timer.unref?.();
}

export function stopRelay(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
