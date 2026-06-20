import { describe, it, expect } from "vitest";
import { prisma } from "./helpers/integration";
import { runSeed, SEED } from "../scripts/seed";
import { detectConflicts } from "../services/conflict";

describe("demo seed (F12)", () => {
  it("produces the deterministic dataset: 19 spaces, 6 assets, 4 users, 3 events", async () => {
    await runSeed({ reset: true });
    expect(await prisma.space.count()).toBe(19); // F14: expanded from the 19-space catalog
    expect(await prisma.asset.count()).toBe(6);
    expect(await prisma.user.count()).toBe(4);
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
});
