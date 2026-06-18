import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaStub } = vi.hoisted(() => ({
  prismaStub: {
    space: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("../../config/prisma", () => ({ prisma: prismaStub }));

import { spacesService } from "./service";
import { APIError } from "../../errors";

const blue = {
  id: "space_blue", name: "Blue Hall", floor: 0, kind: "MAIN",
  capacities: { THEATER: 220, BANQUET: 160 }, features: ["stage"],
  dayRateMinor: 80000, currency: "ALL", setupBufferMinutes: 240, teardownBufferMinutes: 120, status: "ACTIVE",
};

describe("SpacesService.match", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by capacity for the requested layout", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({ minCapacity: 180, layout: "THEATER" });
    expect(res.data).toHaveLength(1);

    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res2 = await spacesService.match({ minCapacity: 180, layout: "BANQUET" }); // 160 < 180
    expect(res2.data).toHaveLength(0);
  });
});

describe("SpacesService.update", () => {
  it("404s on unknown id", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(null);
    await expect(spacesService.update("nope", { name: "X" })).rejects.toBeInstanceOf(APIError);
  });
});
