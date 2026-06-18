import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { connect, StringCodec, type NatsConnection } from "nats";
import { loginAs, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedRequest, seedReservation } from "./helpers/fixtures";
import { runRelayPass } from "../modules/events/relay";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };
const sc = StringCodec();
let nc: NatsConnection | null = null;

beforeAll(async () => {
  try {
    nc = await connect({ servers: process.env.NATS_URL ?? "nats://localhost:4222", timeout: 1500 });
  } catch {
    nc = null; // NATS not available — tests below self-skip
  }
});
afterAll(async () => {
  await nc?.drain().catch(() => undefined);
});
beforeEach(resetDb);

/** Inject a core-NATS publisher so the relay round-trips through a real broker. */
function natsPublisher() {
  return async (subject: string, payload: unknown) => {
    nc!.publish(`e2e.${subject}`, sc.encode(JSON.stringify(payload)));
    return true;
  };
}

describe("F11-T06 events: outbox → relay → a real NATS consumer receives", () => {
  it("delivers reservation.held + conflict.detected to a subscriber", async (ctx) => {
    if (!nc) return ctx.skip();
    const received: Record<string, unknown[]> = {};
    const sub = nc.subscribe("e2e.>");
    void (async () => {
      for await (const m of sub) {
        const subj = m.subject.replace(/^e2e\./, "");
        (received[subj] ??= []).push(JSON.parse(sc.decode(m.data)));
      }
    })();

    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });

    // a clean hold → reservation.held
    const req = await seedRequest();
    await client.post(RES).send({ requestId: req.id, spaceId: space.id, dateRange: W });
    // a conflicting hold → conflict.detected
    const taken = await seedRequest();
    await seedReservation({ space, requestId: taken.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const req2 = await seedRequest();
    await client.post(RES).send({ requestId: req2.id, spaceId: space.id, dateRange: W });

    const published = await runRelayPass(natsPublisher());
    expect(published).toBeGreaterThanOrEqual(2);
    await nc.flush();
    await new Promise((r) => setTimeout(r, 150));

    expect(received["reservation.held"]?.length).toBeGreaterThanOrEqual(1);
    expect(received["conflict.detected"]?.length).toBeGreaterThanOrEqual(1);

    // duplicate delivery (re-publish) doesn't corrupt the consumer's view (idempotent subjects)
    await natsPublisher()("reservation.held", { reservationId: "dup" });
    await nc.flush();
    await new Promise((r) => setTimeout(r, 100));
    expect(received["reservation.held"]!.length).toBeGreaterThanOrEqual(2);
  });
});
