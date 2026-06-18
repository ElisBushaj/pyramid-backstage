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
        },
      });
      await writeAudit(tx, {
        actor, action: "space.create", entityType: "Space", entityId: created.id,
        after: { name: created.name, floor: created.floor, dayRateMinor: created.dayRateMinor },
      });
      return created;
    });
    return ok(spaceToDto(row), "space.created");
  }

  async update(actor: Actor, id: string, input: Partial<SpaceInput>): Promise<ServiceResponse<Space>> {
    const existing = await prisma.space.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound();
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.space.update({ where: { id }, data: input });
      await writeAudit(tx, {
        actor, action: "space.update", entityType: "Space", entityId: id,
        before: { name: existing.name, dayRateMinor: existing.dayRateMinor, status: existing.status },
        after: { name: updated.name, dayRateMinor: updated.dayRateMinor, status: updated.status },
      });
      return updated;
    });
    return ok(spaceToDto(row), "space.updated");
  }
}

export const spacesService = new SpacesService();
