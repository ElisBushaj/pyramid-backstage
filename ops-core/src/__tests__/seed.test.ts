import { describe, it, expect } from "vitest";
import { prisma, resetDb } from "./helpers/integration";
import { runSeed, SEED } from "../scripts/seed";
import { detectConflicts } from "../services/conflict";

describe("demo seed (F12)", () => {
  it("produces the deterministic dataset: 51 spaces, 6 assets, 5 users, 3 events", async () => {
    await runSeed({ reset: true });
    // PR#7 rebuilt the venue from the real Pyramid floor spec (Floors 0/-1/3),
    // expanding the catalog to 51 spaces. Pinned to the catalog the seed actually
    // loads, so an unintended catalog edit fails loudly right here.
    expect(SEED.SPACES.length).toBe(51);
    expect(await prisma.space.count()).toBe(SEED.SPACES.length);
    expect(await prisma.asset.count()).toBe(6);
    expect(await prisma.user.count()).toBe(5); // F15: + the demo PARTNER
    expect(await prisma.eventRequest.count()).toBe(3);

    // stable ids
    expect(await prisma.space.findUnique({ where: { id: SEED.SPACES[0]!.id } })).toBeTruthy();
    expect(await prisma.user.findUnique({ where: { email: "manager@pyramid.al" } })).toBeTruthy();

    // E1 is fully planned + SCHEDULED with a CONFIRMED reservation + a quote + tasks
    const e1 = await prisma.eventRequest.findFirstOrThrow({ where: { title: "FinTech Startup Conference" } });
    expect(e1.status).toBe("SCHEDULED");
    expect(await prisma.reservation.count({ where: { requestId: e1.id, status: "CONFIRMED" } })).toBe(1);
    expect(await prisma.quote.count({ where: { requestId: e1.id } })).toBe(1);
    expect(await prisma.task.count({ where: { requestId: e1.id } })).toBe(3);
  });

  it("plants a real conflict: Blue Hall is occupied at W1 (detectConflicts → SPACE_DOUBLE_BOOKED)", async () => {
    await runSeed({ reset: true });
    const conflicts = await detectConflicts({ spaceId: SEED.BLUE, start: new Date(SEED.W1.start), end: new Date(SEED.W1.end) });
    expect(conflicts.some((c) => c.type === "SPACE_DOUBLE_BOOKED")).toBe(true);
    // ...but Green Hall at the same window is free
    const green = await detectConflicts({ spaceId: SEED.GREEN, start: new Date(SEED.W1.start), end: new Date(SEED.W1.end) });
    expect(green).toEqual([]);
  });

  it("is deterministic: re-running --reset reproduces the same counts", async () => {
    await runSeed({ reset: true });
    const counts = [await prisma.space.count(), await prisma.asset.count(), await prisma.user.count(), await prisma.eventRequest.count()];
    await runSeed({ reset: true });
    expect([await prisma.space.count(), await prisma.asset.count(), await prisma.user.count(), await prisma.eventRequest.count()]).toEqual(counts);
  });

  // --spaces-only is the prod-safe catalog reconcile deploy.sh runs on every deploy
  // (and the dev container runs on boot). It must load the full catalog WITHOUT
  // touching users/events, so a live DB picks up new spaces with zero side effects.
  it("--spaces-only loads the full catalog and creates no users/events", async () => {
    await resetDb(); // a fresh DB missing the new catalog spaces
    expect(await prisma.space.count()).toBe(0);

    await runSeed({ spacesOnly: true });
    expect(await prisma.space.count()).toBe(SEED.SPACES.length);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.eventRequest.count()).toBe(0);
  });

  // A re-seed used to only upsert, so spaces the catalog dropped (the old F14 ids
  // 7-19 the real-floor model replaced) lingered as orphans. syncSpaces prunes them
  // back to the catalog — but never one that still carries reservations.
  it("--spaces-only prunes catalog-absent spaces but keeps ones with reservations", async () => {
    await runSeed({ reset: true });

    // Orphan A — catalog-absent, NO reservations → must be pruned.
    const prunable = "50000000-0000-4000-8000-000000000007";
    await prisma.space.create({ data: { id: prunable, name: "Old space 7", floor: 1, kind: "TRANSITIONAL", capacities: {}, dayRateMinor: 0 } });

    // Orphan B — catalog-absent but it carries a reservation → must be KEPT (deleting
    // it would orphan the booking). Hang the reservation off a seeded request.
    const kept = "50000000-0000-4000-8000-000000000008";
    await prisma.space.create({ data: { id: kept, name: "Old space 8", floor: 1, kind: "TRANSITIONAL", capacities: {}, dayRateMinor: 0 } });
    const someRequest = await prisma.eventRequest.findFirstOrThrow();
    await prisma.reservation.create({ data: {
      requestId: someRequest.id, spaceId: kept,
      start: new Date(SEED.W2.start), end: new Date(SEED.W2.end),
      effectiveStart: new Date(SEED.W2.start), effectiveEnd: new Date(SEED.W2.end),
    } });

    expect(await prisma.space.count()).toBe(SEED.SPACES.length + 2);

    await runSeed({ spacesOnly: true });

    expect(await prisma.space.findUnique({ where: { id: prunable } })).toBeNull();
    expect(await prisma.space.findUnique({ where: { id: kept } })).toBeTruthy();
    expect(await prisma.space.count()).toBe(SEED.SPACES.length + 1); // catalog + the kept orphan

    // The catalog-resident, reservation-bound Blue Hall is also left untouched.
    expect(await prisma.space.findUnique({ where: { id: SEED.BLUE } })).toBeTruthy();
    expect(await prisma.reservation.count({ where: { spaceId: SEED.BLUE } })).toBeGreaterThan(0);
  });
});
