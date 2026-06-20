import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { Space, SpaceInput, SpaceWithAvailability } from "../../types/api/spaces";
import { writeAudit } from "../audit/audit.writer";
import { spaceAvailability, type SpaceAvailabilityResult } from "../../services/availability";

interface MatchParams {
  minCapacity?: number;
  layout?: string;
  start?: string;
  end?: string;
}

type SpaceRow = {
  id: string; name: string; floor: number; kind: string; capacities: unknown;
  features: string[]; dayRateMinor: number; currency: string;
  setupBufferMinutes: number; teardownBufferMinutes: number; status: string;
  // catalog-extension fields (F14)
  slug?: string | null; category?: string | null; zone?: string | null;
  isCirculation?: boolean; adjacent?: string[]; map?: unknown; ceilingCm?: number | null;
};

export function spaceToDto(row: SpaceRow): Space {
  return {
    id: row.id,
    name: row.name,
    floor: row.floor,
    kind: row.kind as Space["kind"],
    capacities: (row.capacities ?? {}) as Record<string, number>,
    features: row.features,
    dayRateMinor: row.dayRateMinor,
    currency: row.currency as "ALL",
    setupBufferMinutes: row.setupBufferMinutes,
    teardownBufferMinutes: row.teardownBufferMinutes,
    status: row.status as Space["status"],
    // catalog-extension fields (F14): undefined when absent so JSON stays lean.
    slug: row.slug ?? undefined,
    category: (row.category ?? undefined) as Space["category"],
    zone: row.zone ?? undefined,
    isCirculation: row.isCirculation ?? false,
    adjacent: row.adjacent ?? [],
    map: (row.map ?? undefined) as Space["map"],
    ceilingCm: row.ceilingCm ?? undefined,
  };
}

const maxCapacity = (caps: Record<string, number>): number =>
  Object.values(caps).reduce((m, v) => Math.max(m, v), 0);

class SpacesService {
  /**
   * Match + filter active spaces. With `layout`, capacity is read for that
   * layout (a space lacking it is excluded). Without `layout`, `minCapacity`
   * matches the space's max supported-layout capacity. When `start`&`end` are
   * supplied each survivor is annotated buffer-aware `available` (F05).
   */
  async match(p: MatchParams): Promise<ServiceResponse<SpaceWithAvailability[]>> {
    const rows = await prisma.space.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
    let spaces: SpaceWithAvailability[] = rows.map(spaceToDto);

    if (p.minCapacity !== undefined) {
      const min = p.minCapacity;
      spaces = spaces.filter((s) =>
        p.layout ? (s.capacities[p.layout] ?? 0) >= min : maxCapacity(s.capacities) >= min,
      );
    } else if (p.layout) {
      spaces = spaces.filter((s) => p.layout! in s.capacities);
    }

    if (p.start && p.end) {
      const start = new Date(p.start);
      const end = new Date(p.end);
      spaces = await Promise.all(
        spaces.map(async (s) => ({ ...s, available: (await spaceAvailability(s.id, start, end)).available })),
      );
    }
    return ok(spaces, "space.list.success");
  }

  async getById(id: string): Promise<SpaceRow> {
    const row = await prisma.space.findUnique({ where: { id } });
    if (!row) throw APIError.notFound();
    return row;
  }

  /** GET /spaces/:id/availability — 404 unknown space, else buffer-aware check. */
  async availabilityFor(id: string, start: string, end: string): Promise<ServiceResponse<SpaceAvailabilityResult>> {
    await this.getById(id); // 404s on unknown id
    const result = await spaceAvailability(id, new Date(start), new Date(end));
    return ok(result, "space.availability.success");
  }

  async create(actor: Actor, input: SpaceInput): Promise<ServiceResponse<Space>> {
    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.space.create({
          data: {
            name: input.name,
            floor: input.floor,
            kind: input.kind ?? "MAIN",
            capacities: input.capacities,
            features: input.features ?? [],
            dayRateMinor: input.dayRateMinor,
            setupBufferMinutes: input.setupBufferMinutes ?? 240,
            teardownBufferMinutes: input.teardownBufferMinutes ?? 120,
            // catalog-extension fields (F14) — optional via the API; primarily seed-populated.
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.category !== undefined ? { category: input.category } : {}),
            ...(input.zone !== undefined ? { zone: input.zone } : {}),
            ...(input.isCirculation !== undefined ? { isCirculation: input.isCirculation } : {}),
            ...(input.adjacent !== undefined ? { adjacent: input.adjacent } : {}),
            ...(input.map !== undefined ? { map: input.map as object } : {}),
            ...(input.ceilingCm !== undefined ? { ceilingCm: input.ceilingCm } : {}),
          },
        });
        await writeAudit(tx, {
          actor, action: "space.create", entityType: "Space", entityId: created.id,
          after: { name: created.name, floor: created.floor, dayRateMinor: created.dayRateMinor },
        });
        return created;
      });
      return ok(spaceToDto(row), "space.created");
    } catch (e) {
      // A duplicate `slug` is the one unique constraint on Space — map the P2002
      // to the 422 contract (field-level) so it never escapes as a 500. Mirrors
      // the users service's email-uniqueness handling.
      throw mapSpaceUniqueViolation(e);
    }
  }

  async update(actor: Actor, id: string, input: Partial<SpaceInput>): Promise<ServiceResponse<Space>> {
    const existing = await prisma.space.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound();
    // Whitelist updatable columns — never spread req.body (it would mass-assign
    // currency, or any stray scalar). Mirrors the explicit field list in create().
    const data: Prisma.SpaceUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.floor !== undefined) data.floor = input.floor;
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.capacities !== undefined) data.capacities = input.capacities as Prisma.InputJsonValue;
    if (input.dayRateMinor !== undefined) data.dayRateMinor = input.dayRateMinor;
    if (input.features !== undefined) data.features = input.features;
    if (input.setupBufferMinutes !== undefined) data.setupBufferMinutes = input.setupBufferMinutes;
    if (input.teardownBufferMinutes !== undefined) data.teardownBufferMinutes = input.teardownBufferMinutes;
    const status = (input as { status?: "ACTIVE" | "INACTIVE" }).status;
    if (status !== undefined) data.status = status;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.category !== undefined) data.category = input.category;
    if (input.zone !== undefined) data.zone = input.zone;
    if (input.isCirculation !== undefined) data.isCirculation = input.isCirculation;
    if (input.adjacent !== undefined) data.adjacent = input.adjacent;
    if (input.map !== undefined) data.map = input.map as unknown as Prisma.InputJsonValue;
    if (input.ceilingCm !== undefined) data.ceilingCm = input.ceilingCm;
    try {
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.space.update({ where: { id }, data });
        await writeAudit(tx, {
          actor, action: "space.update", entityType: "Space", entityId: id,
          before: { name: existing.name, dayRateMinor: existing.dayRateMinor, status: existing.status },
          after: { name: updated.name, dayRateMinor: updated.dayRateMinor, status: updated.status },
        });
        return updated;
      });
      return ok(spaceToDto(row), "space.updated");
    } catch (e) {
      throw mapSpaceUniqueViolation(e);
    }
  }
}

/**
 * Map a Prisma unique-constraint violation on Space (only `slug` is unique) to
 * the field-level 422 contract; re-throw anything else unchanged. Keeps a
 * duplicate slug from escaping as a 500 (F14). `validation.invalid` is the
 * registered field key — a dedicated `space.slug_taken` would read better but
 * is not yet in the locale registry.
 */
function mapSpaceUniqueViolation(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return APIError.validation({ slug: "validation.invalid" });
  }
  return e;
}

export const spacesService = new SpacesService();
