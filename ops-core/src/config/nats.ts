import { connect, type NatsConnection } from "nats";
import { vars } from "./vars";
import { logger } from "./logger";

/**
 * NATS is the live-dashboard bus. It is DEGRADABLE: if NATS_ENABLED=false or the
 * broker is unreachable, the system runs fine over REST — publishing becomes a
 * no-op. Events are written to the OutboxEvent table regardless (ADR-0002); the
 * relay (F11-T03) is what actually publishes. This module is the connection.
 */
let nc: NatsConnection | null = null;

export async function initNats(): Promise<void> {
  if (!vars.natsEnabled) {
    logger.warn("[nats] disabled (NATS_ENABLED=false) — running REST-only");
    return;
  }
  try {
    nc = await connect({ servers: vars.natsUrl, name: "ops-core" });
    logger.info({ url: vars.natsUrl }, "[nats] connected");
  } catch (err) {
    logger.error({ err }, "[nats] connect failed — degrading to REST-only");
    nc = null;
  }
}

export function natsReady(): boolean {
  return !vars.natsEnabled || nc !== null;
}

export function getNats(): NatsConnection | null {
  return nc;
}

export async function closeNats(): Promise<void> {
  await nc?.drain();
  nc = null;
}
