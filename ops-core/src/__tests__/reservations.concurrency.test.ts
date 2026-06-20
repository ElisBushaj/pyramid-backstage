import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { loginAs, resetDb, prisma, outboxFor } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { reservationsService } from "../modules/reservations/service";

const RES = "/api/v1/private/reservations";
const W = { start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" };

beforeEach(resetDb);

// The whole point of F06: the serializable tx + FOR UPDATE row locks (and the
// broadened isSerializationError retry) turn the TOCTOU race into a deterministic
// single winner. Under contention nobody must ever see a 500 — a real serialization
// abort retries and re-checks into a clean 201 / 409 / 429.
describe("F06-T06 concurrency: serializable tx + row locks kill the TOCTOU race", () => {
  it("two parallel holds for one scarce ASSET → exactly one wins, the other 409 ASSET_OVERALLOCATED", async () => {
    const client = await loginAs("OPS");
    // distinct spaces so ONLY the shared asset can cause a conflict
    const spaceA = await seedSpace();
    const spaceB = await seedSpace();
    const chairs = await seedAsset({ totalQuantity: 10 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    const [a, b] = await Promise.all([
      client.post(RES, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1").send({ requestId: r1.id, spaceId: spaceA.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 6 }] }),
      client.post(RES, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2").send({ requestId: r2.id, spaceId: spaceB.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 6 }] }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error).toBe("conflict");
    expect(loser.body.conflicts.some((c: any) => c.type === "ASSET_OVERALLOCATED")).toBe(true);

    // post-condition: total held never exceeds stock; exactly one reservation; no partial loser row
    const held = await prisma.reservationAsset.aggregate({ _sum: { quantity: true }, where: { assetId: chairs.id, reservation: { status: "HELD" } } });
    expect(held._sum.quantity ?? 0).toBeLessThanOrEqual(10);
    expect(await prisma.reservation.count({ where: { status: "HELD" } })).toBe(1);
    // no partial loser row: the rolled-back hold left no orphan ReservationAsset behind
    expect(await prisma.reservationAsset.count({ where: { assetId: chairs.id } })).toBe(1);
  });

  it("two parallel holds for one SPACE window → exactly one wins, the other 409 SPACE_DOUBLE_BOOKED", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    const [a, b] = await Promise.all([
      client.post(RES, "cccccccc-cccc-4ccc-8ccc-ccccccccccc1").send({ requestId: r1.id, spaceId: space.id, dateRange: W }),
      client.post(RES, "dddddddd-dddd-4ddd-8ddd-ddddddddddd2").send({ requestId: r2.id, spaceId: space.id, dateRange: W }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.conflicts.some((c: any) => c.type === "SPACE_DOUBLE_BOOKED")).toBe(true);
    expect(await prisma.reservation.count({ where: { spaceId: space.id, status: "HELD" } })).toBe(1);
  });

  it("two parallel holds whose only collision is the buffer zone → one wins, the other 409 SETUP_WINDOW_OVERLAP", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 240, teardownBufferMinutes: 120 });
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    // Event windows touch (12:00 == 12:00) so they do NOT overlap, but the 4h setup /
    // 2h teardown buffers do — exactly one may take the slot.
    const [a, b] = await Promise.all([
      client.post(RES, randomUUID()).send({ requestId: r1.id, spaceId: space.id, dateRange: { start: "2026-07-22T08:00:00Z", end: "2026-07-22T12:00:00Z" } }),
      client.post(RES, randomUUID()).send({ requestId: r2.id, spaceId: space.id, dateRange: { start: "2026-07-22T12:00:00Z", end: "2026-07-22T16:00:00Z" } }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.conflicts.some((c: any) => ["SETUP_WINDOW_OVERLAP", "SPACE_DOUBLE_BOOKED"].includes(c.type))).toBe(true);
    expect(await prisma.reservation.count({ where: { spaceId: space.id, status: "HELD" } })).toBe(1);
  });

  it("under contention nobody ever 500s: many simultaneous holds for one scarce SPACE → one 201, the rest 409/429", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const N = 8;
    const requests = await Promise.all(Array.from({ length: N }, () => seedRequest()));

    const results = await Promise.all(
      requests.map((r) => client.post(RES, randomUUID()).send({ requestId: r.id, spaceId: space.id, dateRange: W })),
    );
    const statuses = results.map((r) => r.status);

    // exactly one winner; the rest are clean conflicts/rate-limits; never a 500.
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 500)).toHaveLength(0);
    for (const s of statuses) expect([201, 409, 429]).toContain(s);
    for (const r of results) {
      if (r.status === 409) expect(["conflict"]).toContain(r.body.error);
      if (r.status === 429) expect(r.body.error).toBe("rate_limited");
    }
    // and the DB invariant holds: a single HELD reservation for the space.
    expect(await prisma.reservation.count({ where: { spaceId: space.id, status: "HELD" } })).toBe(1);
  });

  it("under contention for one scarce ASSET, total held never exceeds stock and no row is half-written", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 10 });
    const N = 6;
    // distinct spaces so the asset is the only point of contention
    const spaces = await Promise.all(Array.from({ length: N }, () => seedSpace()));
    const requests = await Promise.all(Array.from({ length: N }, () => seedRequest()));

    const results = await Promise.all(
      requests.map((r, i) => client.post(RES, randomUUID()).send({ requestId: r.id, spaceId: spaces[i]!.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 6 }] })),
    );
    const statuses = results.map((r) => r.status);

    // qty 6 of 10 means at most ONE can win; never a 500.
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 500)).toHaveLength(0);
    for (const s of statuses) expect([201, 409, 429]).toContain(s);

    const held = await prisma.reservationAsset.aggregate({ _sum: { quantity: true }, where: { assetId: chairs.id, reservation: { status: "HELD" } } });
    expect(held._sum.quantity ?? 0).toBeLessThanOrEqual(10);
    // every losing transaction rolled back cleanly: no orphan ReservationAsset rows.
    expect(await prisma.reservationAsset.count({ where: { assetId: chairs.id } })).toBe(statuses.filter((s) => s === 201).length);
  });

  it("two holds that fit together both succeed (no false serialization rejection)", async () => {
    const client = await loginAs("OPS");
    const chairs = await seedAsset({ totalQuantity: 10 });
    const spaceA = await seedSpace();
    const spaceB = await seedSpace();
    const r1 = await seedRequest();
    const r2 = await seedRequest();

    // 4 + 4 = 8 ≤ 10 → both must win even though they touch the same asset row lock.
    const [a, b] = await Promise.all([
      client.post(RES, randomUUID()).send({ requestId: r1.id, spaceId: spaceA.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 4 }] }),
      client.post(RES, randomUUID()).send({ requestId: r2.id, spaceId: spaceB.id, dateRange: W, assets: [{ assetId: chairs.id, quantity: 4 }] }),
    ]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const held = await prisma.reservationAsset.aggregate({ _sum: { quantity: true }, where: { assetId: chairs.id, reservation: { status: "HELD" } } });
    expect(held._sum.quantity).toBe(8);
  });

  it("parallel confirm of one HELD reservation: CAS lets exactly one through (200), the loser gets a clean 409 — never 500, never a double-confirm", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const held = (await client.post(RES, randomUUID()).send({ requestId: req.id, spaceId: space.id, dateRange: W })).body.data;

    // Two distinct idempotency keys racing the same row → the compare-and-set
    // (UPDATE … WHERE status='HELD') admits exactly one writer; the other observes
    // count 0 and returns 409 invalid_transition (or an idempotent 200 if it lost
    // the race after the winner committed). Either way: no 500, no double-write.
    const [c1, c2] = await Promise.all([
      client.post(`${RES}/${held.id}/confirm`, randomUUID()),
      client.post(`${RES}/${held.id}/confirm`, randomUUID()),
    ]);

    expect([c1.status, c2.status]).not.toContain(500);
    for (const r of [c1, c2]) expect([200, 409]).toContain(r.status);
    // at least one must have succeeded
    expect([c1.status, c2.status]).toContain(200);
    // any 409 loser is a precise invalid_transition, not a conflict or garbage
    for (const r of [c1, c2]) if (r.status === 409) expect(r.body.error).toBe("invalid_transition");

    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } })).status).toBe("CONFIRMED");
    // the CAS guard means exactly one confirm actually mutated → exactly one event/audit.
    expect(await outboxFor("reservation.confirmed")).toHaveLength(1);
    expect(await prisma.auditEntry.count({ where: { action: "reservation.confirm", entityId: held.id } })).toBe(1);
  });

  it("parallel confirm + release of the same HELD reservation never 500s and lands in one terminal state", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    const held = (await client.post(RES, randomUUID()).send({ requestId: req.id, spaceId: space.id, dateRange: W })).body.data;

    const [confirm, release] = await Promise.all([
      client.post(`${RES}/${held.id}/confirm`, randomUUID()),
      client.post(`${RES}/${held.id}/release`, randomUUID()),
    ]);

    expect(confirm.status).not.toBe(500);
    expect(release.status).not.toBe(500);
    // whoever lost the CAS gets a clean answer (200 idempotent or 409 invalid_transition), never a 500.
    for (const r of [confirm, release]) expect([200, 409]).toContain(r.status);
    const final = await prisma.reservation.findUniqueOrThrow({ where: { id: held.id } });
    expect(["CONFIRMED", "RELEASED"]).toContain(final.status);
  });
});

// Sustained contention can abort the SAME hold transaction on every attempt. Real
// Postgres can't be coerced into 4 back-to-back serialization aborts on demand, so
// we force it: reject ONLY the serializable hold transaction (let the small
// best-effort outbox writes through), proving the retry loop degrades to a clean
// 429 / 409 and NEVER lets a raw serialization error escape as a 500.
describe("F06-T06 retry exhaustion: sustained serialization aborts degrade to 429/409, never 500", () => {
  // Capture the pristine method ONCE so the delegating mock never recurses into itself
  // and restoration is exact (Prisma's $transaction lives on a proxy, not as an own prop).
  const ORIGINAL_TX = prisma.$transaction;
  afterEach(() => {
    (prisma as { $transaction: typeof ORIGINAL_TX }).$transaction = ORIGINAL_TX;
    vi.restoreAllMocks();
  });

  /** Replace $transaction so it rejects ONLY the serializable hold tx with the given
   *  error, while delegating every other call (e.g. the conflict.detected outbox)
   *  to the pristine implementation. */
  function failHoldTxWith(err: unknown) {
    const impl = ((arg: unknown, opts?: { isolationLevel?: unknown }) => {
      if (typeof arg === "function" && opts?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
        return Promise.reject(err);
      }
      return (ORIGINAL_TX as (a: unknown, o?: unknown) => unknown).call(prisma, arg, opts);
    }) as typeof prisma.$transaction;
    (prisma as { $transaction: typeof ORIGINAL_TX }).$transaction = impl;
  }

  function forceHoldSerializationAbort() {
    failHoldTxWith(new Prisma.PrismaClientKnownRequestError("could not serialize access due to read/write dependencies among transactions", { code: "P2034", clientVersion: "test" }));
  }

  it("every attempt serialize-aborts and no real conflict exists → 429 rate_limited (not 500)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();
    forceHoldSerializationAbort();

    await expect(
      reservationsService.hold(client.user, { requestId: req.id, spaceId: space.id, dateRange: W }),
    ).rejects.toMatchObject({ status: 429, error: "rate_limited", messageKey: "common.rate_limited" });

    // pure contention → no phantom conflict.detected emitted, nothing written
    expect(await outboxFor("conflict.detected")).toHaveLength(0);
    expect(await prisma.reservation.count({ where: { requestId: req.id } })).toBe(0);
  });

  it("every attempt serialize-aborts but the winner took the slot → 409 conflict with the live conflicts[]", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const winner = await seedRequest();
    await seedReservation({ space, requestId: winner.id, start: W.start, end: W.end, status: "CONFIRMED" });
    const loser = await seedRequest();
    forceHoldSerializationAbort();

    await expect(
      reservationsService.hold(client.user, { requestId: loser.id, spaceId: space.id, dateRange: W }),
    ).rejects.toMatchObject({ status: 409, error: "conflict", messageKey: "reservation.conflict" });

    // the re-detect found the winner's booking → it emits the conflict.detected story
    expect(await outboxFor("conflict.detected")).toHaveLength(1);
    expect(await prisma.reservation.count({ where: { requestId: loser.id } })).toBe(0);
  });

  it("a non-serialization DB error is surfaced immediately (no retry, no swallow)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({ setupBufferMinutes: 0, teardownBufferMinutes: 0 });
    const req = await seedRequest();

    let serializableCalls = 0;
    const boom = new Prisma.PrismaClientKnownRequestError("unique constraint", { code: "P2002", clientVersion: "test" });
    const impl = ((arg: unknown, opts?: { isolationLevel?: unknown }) => {
      if (typeof arg === "function" && opts?.isolationLevel === Prisma.TransactionIsolationLevel.Serializable) {
        serializableCalls++;
        return Promise.reject(boom);
      }
      return (ORIGINAL_TX as (a: unknown, o?: unknown) => unknown).call(prisma, arg, opts);
    }) as typeof prisma.$transaction;
    (prisma as { $transaction: typeof ORIGINAL_TX }).$transaction = impl;

    // a P2002 is NOT serialization → it must escape on the FIRST attempt, not retry 4x.
    await expect(reservationsService.hold(client.user, { requestId: req.id, spaceId: space.id, dateRange: W })).rejects.toMatchObject({ code: "P2002" });
    expect(serializableCalls).toBe(1);
  });
});
