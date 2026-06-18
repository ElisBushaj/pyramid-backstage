import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaStub } = vi.hoisted(() => ({
  prismaStub: {
    space: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../config/prisma", () => ({ prisma: prismaStub }));

import { spacesService } from "./service";
import { APIError } from "../../errors";
import type { Actor } from "../../types";

const actor: Actor = { id: "u_1", name: "Ops", role: "OPS" };
const blue = {
  id: "space_blue", name: "Blue Hall", floor: 0, kind: "MAIN",
  capacities: { THEATER: 220, BANQUET: 160 }, features: ["stage"],
  dayRateMinor: 80000, currency: "ALL", setupBufferMinutes: 240, teardownBufferMinutes: 120, status: "ACTIVE",
};
const small = { ...blue, id: "space_small", name: "Small", capacities: { THEATER: 90, BANQUET: 70 } };

describe("SpacesService.match (F02-T03)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by capacity for the requested layout, excluding smaller rooms", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    const res = await spacesService.match({ minCapacity: 180, layout: "THEATER" });
    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.id).toBe("space_blue");
  });

  it("excludes a space lacking the requested layout", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({ minCapacity: 50, layout: "CLASSROOM" });
    expect(res.data).toHaveLength(0);
  });

  it("without layout, minCapacity matches the max supported-layout capacity", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    const res = await spacesService.match({ minCapacity: 200 });
    expect(res.data.map((s) => s.id)).toEqual(["space_blue"]); // max(220,160)=220 ≥200; small max 90 <200
  });
});

describe("SpacesService.update (F02-T02)", () => {
  it("404s on unknown id (before opening a transaction)", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(null);
    await expect(spacesService.update(actor, "nope", { name: "X" })).rejects.toBeInstanceOf(APIError);
  });
});
