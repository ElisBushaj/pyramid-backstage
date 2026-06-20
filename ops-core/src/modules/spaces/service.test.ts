import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { prismaStub } = vi.hoisted(() => ({
  prismaStub: {
    space: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../../config/prisma", () => ({ prisma: prismaStub }));

// The availability annotation is a separate, DB-backed service (F05) — stub it so
// these stay pure unit tests of the matching/mapping logic.
const { spaceAvailabilityMock } = vi.hoisted(() => ({ spaceAvailabilityMock: vi.fn() }));
vi.mock("../../services/availability", () => ({ spaceAvailability: spaceAvailabilityMock }));

import { spacesService, spaceToDto } from "./service";
import { APIError } from "../../errors";
import type { Actor } from "../../types";

const actor: Actor = { id: "u_1", name: "Ops", role: "OPS" };
const blue = {
  id: "space_blue", name: "Blue Hall", floor: 0, kind: "MAIN",
  capacities: { THEATER: 220, BANQUET: 160 }, features: ["stage"],
  dayRateMinor: 80000, currency: "ALL", setupBufferMinutes: 240, teardownBufferMinutes: 120, status: "ACTIVE",
};
const small = { ...blue, id: "space_small", name: "Small", capacities: { THEATER: 90, BANQUET: 70 } };

/** A Prisma unique-constraint error (code P2002) — the only one Space can hit (slug). */
function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["slug"] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  spaceAvailabilityMock.mockResolvedValue({ spaceId: "x", available: true, conflictingRequestIds: [] });
});

describe("spaceToDto mapping", () => {
  it("maps the base shape and defaults catalog fields when absent", () => {
    const dto = spaceToDto(blue);
    expect(dto.id).toBe("space_blue");
    expect(dto.capacities).toEqual({ THEATER: 220, BANQUET: 160 });
    expect(dto.currency).toBe("ALL");
    // catalog fields default: undefined (omitted) except adjacent=[] / isCirculation=false.
    expect(dto.slug).toBeUndefined();
    expect(dto.category).toBeUndefined();
    expect(dto.zone).toBeUndefined();
    expect(dto.map).toBeUndefined();
    expect(dto.ceilingCm).toBeUndefined();
    expect(dto.adjacent).toEqual([]);
    expect(dto.isCirculation).toBe(false);
  });

  it("passes catalog fields through when present", () => {
    const dto = spaceToDto({
      ...blue,
      slug: "blue_hall", category: "HALL", zone: "F0-N", isCirculation: true,
      adjacent: ["x", "y"], map: { floor: 0, ring: "outer", sectorFrom: 1, sectorTo: 4 }, ceilingCm: 850,
    });
    expect(dto.slug).toBe("blue_hall");
    expect(dto.category).toBe("HALL");
    expect(dto.zone).toBe("F0-N");
    expect(dto.isCirculation).toBe(true);
    expect(dto.adjacent).toEqual(["x", "y"]);
    expect(dto.map).toEqual({ floor: 0, ring: "outer", sectorFrom: 1, sectorTo: 4 });
    expect(dto.ceilingCm).toBe(850);
  });

  it("coerces a null capacities column to {}", () => {
    expect(spaceToDto({ ...blue, capacities: null as unknown as object }).capacities).toEqual({});
  });
});

describe("SpacesService.match — filtering (F02-T03)", () => {
  it("queries only ACTIVE spaces, ordered by name (INACTIVE excluded at the source)", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    await spacesService.match({});
    expect(prismaStub.space.findMany).toHaveBeenCalledWith({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
  });

  it("filters by capacity for the requested layout, excluding smaller rooms", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    const res = await spacesService.match({ minCapacity: 180, layout: "THEATER" });
    expect(res.data.map((s) => s.id)).toEqual(["space_blue"]);
  });

  it("excludes a space lacking the requested layout", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({ minCapacity: 50, layout: "CLASSROOM" });
    expect(res.data).toHaveLength(0);
  });

  it("a space missing the layout counts as 0 capacity (excluded even at minCapacity 1)", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({ minCapacity: 1, layout: "BOARDROOM" });
    expect(res.data).toHaveLength(0);
  });

  it("without layout, minCapacity matches the max supported-layout capacity", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    const res = await spacesService.match({ minCapacity: 200 });
    expect(res.data.map((s) => s.id)).toEqual(["space_blue"]); // max(220,160)=220 ≥200; small max 90 <200
  });

  it("layout filter with no minCapacity keeps only spaces supporting that layout", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, { ...small, capacities: { THEATER: 90 } }]);
    const res = await spacesService.match({ layout: "BANQUET" });
    expect(res.data.map((s) => s.id)).toEqual(["space_blue"]);
  });

  it("no filters returns every ACTIVE space mapped to a DTO", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    const res = await spacesService.match({});
    expect(res.data.map((s) => s.id)).toEqual(["space_blue", "space_small"]);
    expect(res.messageKey).toBe("space.list.success");
  });

  it("minCapacity boundary is inclusive (capacity === minCapacity matches)", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([{ ...blue, capacities: { THEATER: 150 } }]);
    const res = await spacesService.match({ minCapacity: 150, layout: "THEATER" });
    expect(res.data).toHaveLength(1);
  });
});

describe("SpacesService.match — availability annotation (F02-T04)", () => {
  it("omits `available` when no window is supplied (spaceAvailability not called)", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({});
    expect(res.data[0]!.available).toBeUndefined();
    expect(spaceAvailabilityMock).not.toHaveBeenCalled();
  });

  it("omits `available` and skips the check when only one of start/end is supplied", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue]);
    const res = await spacesService.match({ start: "2026-07-22T09:00:00Z" });
    expect(res.data[0]!.available).toBeUndefined();
    expect(spaceAvailabilityMock).not.toHaveBeenCalled();
  });

  it("annotates each survivor with the availability result when a full window is supplied", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    spaceAvailabilityMock.mockImplementation(async (id: string) => ({
      spaceId: id, available: id === "space_blue", conflictingRequestIds: [],
    }));
    const res = await spacesService.match({ start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" });
    expect(res.data.find((s) => s.id === "space_blue")!.available).toBe(true);
    expect(res.data.find((s) => s.id === "space_small")!.available).toBe(false);
    expect(spaceAvailabilityMock).toHaveBeenCalledTimes(2);
  });

  it("annotation runs AFTER capacity filtering (only survivors are checked)", async () => {
    prismaStub.space.findMany.mockResolvedValueOnce([blue, small]);
    await spacesService.match({ minCapacity: 200, start: "2026-07-22T09:00:00Z", end: "2026-07-22T18:00:00Z" });
    expect(spaceAvailabilityMock).toHaveBeenCalledTimes(1); // only `blue` survived
    expect(spaceAvailabilityMock).toHaveBeenCalledWith("space_blue", expect.any(Date), expect.any(Date));
  });
});

describe("SpacesService.getById (F02)", () => {
  it("returns the row for a known id", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(blue);
    const row = await spacesService.getById("space_blue");
    expect(row.id).toBe("space_blue");
  });

  it("unknown id → 404 not_found with the exact contract", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(null);
    const err = await spacesService.getById("nope").catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(404);
    expect(err.error).toBe("not_found");
    expect(err.messageKey).toBe("common.not_found");
  });
});

describe("SpacesService.availabilityFor (F05-T05)", () => {
  it("404s before computing availability when the space is unknown", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(null);
    await expect(spacesService.availabilityFor("nope", "2026-07-22T09:00:00Z", "2026-07-22T18:00:00Z")).rejects.toMatchObject({ status: 404 });
    expect(spaceAvailabilityMock).not.toHaveBeenCalled();
  });

  it("returns the availability result for a known space", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(blue);
    spaceAvailabilityMock.mockResolvedValueOnce({ spaceId: "space_blue", available: false, conflictingRequestIds: ["req_1"] });
    const res = await spacesService.availabilityFor("space_blue", "2026-07-22T09:00:00Z", "2026-07-22T18:00:00Z");
    expect(res.data.available).toBe(false);
    expect(res.data.conflictingRequestIds).toEqual(["req_1"]);
    expect(res.messageKey).toBe("space.availability.success");
  });
});

describe("SpacesService.create — unique-slug mapping (F14)", () => {
  it("maps a P2002 slug collision to 422 validation (never lets it escape as 500)", async () => {
    prismaStub.$transaction.mockRejectedValueOnce(p2002());
    const err = await spacesService.create(actor, {
      name: "Dup", floor: 0, capacities: { THEATER: 100 }, dayRateMinor: 1, slug: "blue_hall",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(422);
    expect(err.error).toBe("validation");
    expect(err.fields.slug).toBeDefined();
  });

  it("re-throws a non-P2002 error unchanged", async () => {
    const boom = new Error("db down");
    prismaStub.$transaction.mockRejectedValueOnce(boom);
    await expect(spacesService.create(actor, { name: "X", floor: 0, capacities: { THEATER: 1 }, dayRateMinor: 1 })).rejects.toBe(boom);
  });

  it("returns the created DTO on success", async () => {
    prismaStub.$transaction.mockResolvedValueOnce(blue);
    const res = await spacesService.create(actor, { name: "Blue Hall", floor: 0, capacities: { THEATER: 220 }, dayRateMinor: 80000 });
    expect(res.data.id).toBe("space_blue");
    expect(res.messageKey).toBe("space.created");
  });
});

describe("SpacesService.update (F02-T02 / F14)", () => {
  it("404s on unknown id before opening a transaction", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(null);
    const err = await spacesService.update(actor, "nope", { name: "X" }).catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(404);
    expect(prismaStub.$transaction).not.toHaveBeenCalled();
  });

  it("maps a P2002 slug collision on update to 422 validation", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(blue);
    prismaStub.$transaction.mockRejectedValueOnce(p2002());
    const err = await spacesService.update(actor, "space_blue", { slug: "orange_hall" }).catch((e) => e);
    expect(err).toBeInstanceOf(APIError);
    expect(err.status).toBe(422);
    expect(err.fields.slug).toBeDefined();
  });

  it("re-throws a non-P2002 update error unchanged", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(blue);
    const boom = new Error("db down");
    prismaStub.$transaction.mockRejectedValueOnce(boom);
    await expect(spacesService.update(actor, "space_blue", { name: "Y" })).rejects.toBe(boom);
  });

  it("returns the updated DTO on success", async () => {
    prismaStub.space.findUnique.mockResolvedValueOnce(blue);
    prismaStub.$transaction.mockResolvedValueOnce({ ...blue, dayRateMinor: 99000 });
    const res = await spacesService.update(actor, "space_blue", { dayRateMinor: 99000 });
    expect(res.data.dayRateMinor).toBe(99000);
    expect(res.messageKey).toBe("space.updated");
  });
});
