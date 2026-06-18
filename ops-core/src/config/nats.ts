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

/** All domain subjects publish under the JetStream `pyramid.` prefix. */
export const SUBJECT_PREFIX = "pyramid";
export const STREAM_NAME = "PYRAMID";

export async function initNats(): Promise<void> {
  if (!vars.natsEnabled) {
    logger.warn("[nats] disabled (NATS_ENABLED=false) — running REST-only");
    return;
  }
  try {
    nc = await connect({ servers: vars.natsUrl, name: "ops-core" });
    await ensureStreams();
    logger.info({ url: vars.natsUrl }, "[nats] connected");
  } catch (err) {
    logger.error({ err }, "[nats] connect failed — degrading to REST-only");
    nc = null;
  }
}

/** Idempotently ensure the JetStream stream covering pyramid.> exists. */
export async function ensureStreams(): Promise<void> {
  if (!vars.natsEnabled || !nc) return;
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.add({ name: STREAM_NAME, subjects: [`${SUBJECT_PREFIX}.>`] });
  } catch {
    // already exists — leave its config untouched
  }
}

/** Publish one domain event to JetStream. No-op (returns false) when disabled. */
export async function publishEvent(subject: string, payload: unknown): Promise<boolean> {
  if (!vars.natsEnabled || !nc) return false;
  const js = nc.jetstream();
  await js.publish(`${SUBJECT_PREFIX}.${subject}`, new TextEncoder().encode(JSON.stringify(payload)));
  return true;
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
