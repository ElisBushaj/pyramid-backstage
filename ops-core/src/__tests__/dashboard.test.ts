import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loginAs, anon, resetDb, prisma } from "./helpers/integration";
import { seedSpace, seedAsset, seedRequest, seedReservation } from "./helpers/fixtures";
import { runSeed, SEED } from "../scripts/seed";

const STATS = "/api/v1/private/dashboard/stats";

beforeEach(resetDb);

/**
 * F13-T05 — the Command-Center KPI read-model. The "things that must not happen":
 *  - a lapsed HELD reservation counting as in-use or toward low-stock;
 *  - an inactive space inflating the denominator, or a retired asset the low-stock count;
 *  - the same space counted twice when it has multiple live reservations;
 *  - off-by-one on the 90% low-stock threshold or the this-week window;
 *  - the read fanning out into per-row N+1 queries;
 *  - PARTNER (or anon) reading staff KPIs.
 */
describe("GET /dashboard/stats — shape + RBAC", () => {
  it("returns the full DashboardStats shape with the success key", async () => {
    const client = await loginAs("OPS");
    const res = await client.get(STATS);
    expect(res.status).toBe(200);
    expect(res.body.messageKey).toBe("dashboard.stats.success");
    expect(res.body.data).toEqual({
      eventsThisWeek: { value: 0, delta: 0, hint: expect.any(String) },
      spacesInUse: { inUse: 0, total: 0 },
      lowStockAssets: { value: 0, hint: expect.any(String) },
      pendingApprovals: { value: 0, hint: expect.any(String) },
    });
  });

  // Staff tier is VIEWER+; PARTNER (rank −1) is excluded, anon is unauthenticated.
  for (const role of ["VIEWER", "OPS", "MANAGER", "ADMIN"] as const) {
    it(`${role} may read the dashboard (200)`, async () => {
      const client = await loginAs(role);
      expect((await client.get(STATS)).status).toBe(200);
    });
  }

  it("PARTNER is forbidden from the dashboard (403 auth.forbidden)", async () => {
    const client = await loginAs("PARTNER");
    const res = await client.get(STATS);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
    expect(res.body.messageKey).toBe("auth.forbidden");
  });

  it("anonymous is unauthorized (401 common.unauthorized)", async () => {
    const res = await anon().get(STATS);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
    expect(res.body.messageKey).toBe("common.unauthorized");
  });
});

describe("GET /dashboard/stats — empty database", () => {
  it("reports all zeros when nothing is seeded", async () => {
    const client = await loginAs("VIEWER");
    const { data } = (await client.get(STATS)).body;
    expect(data.eventsThisWeek).toEqual({ value: 0, delta: 0, hint: expect.any(String) });
    expect(data.spacesInUse).toEqual({ inUse: 0, total: 0 });
    expect(data.lowStockAssets.value).toBe(0);
    expect(data.pendingApprovals.value).toBe(0);
  });
});

describe("GET /dashboard/stats — pendingApprovals = count(status=PROPOSED)", () => {
  it("counts only PROPOSED requests, ignoring every other status", async () => {
    const client = await loginAs("MANAGER");
    await seedRequest({ status: "PROPOSED" });
    await seedRequest({ status: "PROPOSED" });
    await seedRequest({ status: "DRAFT" });
    await seedRequest({ status: "APPROVED" });
    await seedRequest({ status: "SCHEDULED" });
    await seedRequest({ status: "COMPLETED" });
    await seedRequest({ status: "REJECTED" });
    const { data } = (await client.get(STATS)).body;
    expect(data.pendingApprovals.value).toBe(2);
  });
});

describe("GET /dashboard/stats — eventsThisWeek window + delta", () => {
  async function requestCreatedAt(daysAgo: number) {
    const r = await seedRequest({});
    await prisma.eventRequest.update({ where: { id: r.id }, data: { createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
  }

  it("counts requests in the last 7 days and deltas against the prior 7", async () => {
    const client = await loginAs("OPS");
    await requestCreatedAt(1); // this week
    await requestCreatedAt(2); // this week
    await requestCreatedAt(9); // last week
    await requestCreatedAt(21); // older — ignored by both windows
    const { data } = (await client.get(STATS)).body;
    expect(data.eventsThisWeek.value).toBe(2);
    expect(data.eventsThisWeek.delta).toBe(1); // 2 this week − 1 last week
  });

  it("a negative delta when last week outpaced this week", async () => {
    const client = await loginAs("OPS");
    await requestCreatedAt(1); // 1 this week
    await requestCreatedAt(8); // 3 last week
    await requestCreatedAt(9);
    await requestCreatedAt(10);
    const { data } = (await client.get(STATS)).body;
    expect(data.eventsThisWeek.value).toBe(1);
    expect(data.eventsThisWeek.delta).toBe(-2);
  });
});

describe("GET /dashboard/stats — spacesInUse", () => {
  it("counts distinct ACTIVE-or-not spaces with a CONFIRMED reservation; total = ACTIVE spaces", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });
    const { data } = (await client.get(STATS)).body;
    expect(data.spacesInUse).toEqual({ inUse: 1, total: 1 });
  });

  it("counts a live HELD reservation as in-use", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "PROPOSED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "HELD", expiresAt: new Date(Date.now() + 1_800_000) });
    expect((await client.get(STATS)).body.data.spacesInUse.inUse).toBe(1);
  });

  it("does NOT count a lapsed HELD reservation as in-use (expiresAt in the past)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "PROPOSED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "HELD", expiresAt: new Date(Date.now() - 1_000) });
    expect((await client.get(STATS)).body.data.spacesInUse.inUse).toBe(0);
  });

  it("does NOT count RELEASED/CANCELLED reservations as in-use", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "RELEASED" });
    expect((await client.get(STATS)).body.data.spacesInUse.inUse).toBe(0);
  });

  it("counts a space with multiple live reservations exactly once (distinct)", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED" });
    await seedReservation({ space, requestId: req.id, start: "2026-07-25T09:00:00Z", end: "2026-07-25T18:00:00Z", status: "CONFIRMED" });
    expect((await client.get(STATS)).body.data.spacesInUse.inUse).toBe(1);
  });

  it("excludes INACTIVE spaces from the total denominator", async () => {
    const client = await loginAs("OPS");
    await seedSpace({ status: "ACTIVE" });
    await seedSpace({ status: "INACTIVE" });
    expect((await client.get(STATS)).body.data.spacesInUse.total).toBe(1);
  });
});

describe("GET /dashboard/stats — lowStockAssets (held ≥ 90% of totalQuantity)", () => {
  async function holdAsset(opts: { total: number; held: number; status?: "ACTIVE" | "MAINTENANCE" | "RETIRED"; resStatus?: "CONFIRMED" | "HELD"; expiresAt?: Date | null }) {
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    const asset = await seedAsset({ totalQuantity: opts.total, status: opts.status ?? "ACTIVE" });
    await seedReservation({
      space,
      requestId: req.id,
      start: "2026-07-22T09:00:00Z",
      end: "2026-07-22T18:00:00Z",
      status: opts.resStatus ?? "CONFIRMED",
      expiresAt: opts.expiresAt,
      assets: [{ assetId: asset.id, quantity: opts.held }],
    });
    return asset;
  }

  it("flags an asset committed to exactly 90% (boundary is inclusive)", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 9 });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1);
  });

  it("does NOT flag an asset at 89% (just under the threshold)", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 100, held: 89 });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(0);
  });

  it("flags a fully (100%) committed asset", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 10 });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1);
  });

  it("does NOT flag an asset with no holds", async () => {
    const client = await loginAs("OPS");
    await seedAsset({ totalQuantity: 10 });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(0);
  });

  it("counts holds from a live HELD reservation toward low stock", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 10, resStatus: "HELD", expiresAt: new Date(Date.now() + 1_800_000) });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1);
  });

  it("does NOT count holds from a lapsed HELD reservation (so the asset is not low)", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 10, resStatus: "HELD", expiresAt: new Date(Date.now() - 1_000) });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(0);
  });

  it("does NOT count holds from a RELEASED reservation", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 10, resStatus: "CONFIRMED" }); // baseline 1
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    const released = await seedAsset({ totalQuantity: 10 });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "RELEASED", assets: [{ assetId: released.id, quantity: 10 }] });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1); // only the confirmed one
  });

  it("excludes RETIRED/MAINTENANCE assets even when over-committed", async () => {
    const client = await loginAs("OPS");
    await holdAsset({ total: 10, held: 10, status: "RETIRED" });
    await holdAsset({ total: 10, held: 10, status: "MAINTENANCE" });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(0);
  });

  it("sums holds across multiple reservations for one asset before testing the threshold", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    const asset = await seedAsset({ totalQuantity: 10 });
    // 5 + 4 = 9 ≥ 90% of 10 → low.
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: asset.id, quantity: 5 }] });
    await seedReservation({ space, requestId: req.id, start: "2026-07-25T09:00:00Z", end: "2026-07-25T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: asset.id, quantity: 4 }] });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1);
  });
});

describe("GET /dashboard/stats — defensive low-stock fallback", () => {
  it("reports lowStockAssets 0 if the raw count query returns no rows", async () => {
    // Defensive `?? 0` branch: an empty result set must not throw or NaN the tile.
    const { dashboardService } = await import("../modules/dashboard/service");
    const orig = prisma.$queryRaw;
    (prisma as { $queryRaw: unknown }).$queryRaw = async () => [] as unknown[];
    try {
      const res = await dashboardService.stats();
      expect(res.data.lowStockAssets.value).toBe(0);
    } finally {
      (prisma as { $queryRaw: unknown }).$queryRaw = orig;
    }
  });
});

describe("GET /dashboard/stats — combined isolation of KPIs", () => {
  it("a lapsed HELD reservation pollutes neither spacesInUse nor lowStockAssets while live data elsewhere still counts", async () => {
    const client = await loginAs("OPS");
    // Live confirmed booking in space A holding asset X fully → in-use 1, low 1.
    const a = await seedSpace({});
    const reqA = await seedRequest({ status: "APPROVED" });
    const x = await seedAsset({ totalQuantity: 10 });
    await seedReservation({ space: a, requestId: reqA.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: x.id, quantity: 10 }] });
    // Lapsed HELD in space B holding asset Y fully → must NOT count.
    const b = await seedSpace({});
    const reqB = await seedRequest({ status: "PROPOSED" });
    const y = await seedAsset({ totalQuantity: 10 });
    await seedReservation({ space: b, requestId: reqB.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "HELD", expiresAt: new Date(Date.now() - 1_000), assets: [{ assetId: y.id, quantity: 10 }] });

    const { data } = (await client.get(STATS)).body;
    expect(data.spacesInUse).toEqual({ inUse: 1, total: 2 });
    expect(data.lowStockAssets.value).toBe(1);
  });
});

describe("GET /dashboard/stats — no N+1 (single parallel batch)", () => {
  // The read-model issues a fixed set of aggregate queries regardless of data
  // volume. We instrument the exact prisma methods the service calls and assert
  // the call counts stay constant as the dataset grows 10×.
  let counts: { eventRequestCount: number; reservationFindMany: number; spaceCount: number; queryRaw: number };
  const originals: Array<() => void> = [];

  function instrument() {
    counts = { eventRequestCount: 0, reservationFindMany: 0, spaceCount: 0, queryRaw: 0 };
    const erCount = prisma.eventRequest.count.bind(prisma.eventRequest);
    prisma.eventRequest.count = ((...a: unknown[]) => { counts.eventRequestCount++; return (erCount as (...x: unknown[]) => unknown)(...a); }) as typeof prisma.eventRequest.count;
    originals.push(() => { prisma.eventRequest.count = erCount; });

    const rFind = prisma.reservation.findMany.bind(prisma.reservation);
    prisma.reservation.findMany = ((...a: unknown[]) => { counts.reservationFindMany++; return (rFind as (...x: unknown[]) => unknown)(...a); }) as typeof prisma.reservation.findMany;
    originals.push(() => { prisma.reservation.findMany = rFind; });

    const sCount = prisma.space.count.bind(prisma.space);
    prisma.space.count = ((...a: unknown[]) => { counts.spaceCount++; return (sCount as (...x: unknown[]) => unknown)(...a); }) as typeof prisma.space.count;
    originals.push(() => { prisma.space.count = sCount; });

    const raw = prisma.$queryRaw.bind(prisma);
    prisma.$queryRaw = ((...a: unknown[]) => { counts.queryRaw++; return (raw as (...x: unknown[]) => unknown)(...a); }) as typeof prisma.$queryRaw;
    originals.push(() => { prisma.$queryRaw = raw; });
  }

  afterEach(() => {
    while (originals.length) originals.pop()!();
  });

  async function seedVolume(n: number) {
    const space = await seedSpace({});
    const req = await seedRequest({ status: "PROPOSED" });
    const asset = await seedAsset({ totalQuantity: 1000 });
    for (let i = 0; i < n; i++) {
      await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: asset.id, quantity: 1 }] });
    }
  }

  it("dispatches exactly: 2 eventRequest.count + 1 reservation.findMany + 1 space.count + 1 $queryRaw", async () => {
    const client = await loginAs("OPS");
    instrument();
    await client.get(STATS);
    // 2 count() calls (this-week, last-week) + 1 PROPOSED count = 3 eventRequest.count.
    expect(counts.eventRequestCount).toBe(3);
    expect(counts.reservationFindMany).toBe(1);
    expect(counts.spaceCount).toBe(1);
    expect(counts.queryRaw).toBe(1);
  });

  it("query counts do not grow with the number of reservations (no N+1)", async () => {
    const client = await loginAs("OPS");
    await seedVolume(1);
    instrument();
    await client.get(STATS);
    const small = { ...counts };
    while (originals.length) originals.pop()!();

    await seedVolume(20); // 20× more reservation rows
    instrument();
    await client.get(STATS);
    expect(counts).toEqual(small); // identical fan-out
  });
});

describe("GET /dashboard/stats — against the demo seed (F12/F15 reality)", () => {
  // Re-derived from the ACTUAL current seed (src/scripts/seed.ts), which the F15
  // fix changed: a PARTNER-created request now lands PROPOSED, not DRAFT. The seed
  // therefore holds TWO PROPOSED requests (E2 staff-held "Annual Tech Summit" +
  // E3 partner-submitted "Community Art Exhibition"), so pendingApprovals === 2.
  it("computes each KPI from the seeded fixture", async () => {
    await runSeed({ reset: true });
    const client = await loginAs("OPS");
    const res = await client.get(STATS);
    expect(res.status).toBe(200);

    expect(res.body.data.pendingApprovals.value).toBe(2); // E2 + E3 both PROPOSED (F15)
    expect(res.body.data.spacesInUse).toEqual({ inUse: 2, total: SEED.SPACES.length }); // Blue CONFIRMED + Green live-HELD; total = every ACTIVE space in the real-floor catalog (PR#7)
    expect(res.body.data.eventsThisWeek.value).toBe(3); // all 3 requests created during the seed
    expect(res.body.data.eventsThisWeek.delta).toBe(3); // 3 this week − 0 last week
    expect(res.body.data.lowStockAssets.value).toBe(0); // no asset line reaches 90% in the seed
  });

  it("reflects an over-90%-committed asset as low stock", async () => {
    const client = await loginAs("OPS");
    const space = await seedSpace({});
    const req = await seedRequest({ status: "APPROVED" });
    const mics = await seedAsset({ name: "Mic", type: "MICROPHONE", totalQuantity: 10 });
    await seedReservation({ space, requestId: req.id, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z", status: "CONFIRMED", assets: [{ assetId: mics.id, quantity: 10 }] });
    expect((await client.get(STATS)).body.data.lowStockAssets.value).toBe(1);
  });
});
