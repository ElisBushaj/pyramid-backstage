import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse } from "../../types";
import type { Space, SpaceInput, SpaceWithAvailability } from "../../types/api/spaces";

interface MatchParams {
  minCapacity?: number;
  layout?: string;
  start?: string;
  end?: string;
}

function toDto(row: {
  id: string; name: string; floor: number; kind: string; capacities: unknown;
  features: string[]; dayRateMinor: number; currency: string;
  setupBufferMinutes: number; teardownBufferMinutes: number; status: string;
}): Space {
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

class SpacesService {
  /** Match + filter; annotate availability when a window is supplied (F02-T04 wires the engine). */
  async match(p: MatchParams): Promise<ServiceResponse<SpaceWithAvailability[]>> {
    const rows = await prisma.space.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } });
    let spaces: SpaceWithAvailability[] = rows.map(toDto);

    if (p.minCapacity && p.layout) {
      spaces = spaces.filter((s) => (s.capacities[p.layout as string] ?? 0) >= (p.minCapacity as number));
    }
    // TODO(F02-T04): when start&end supplied, set `available` via services/availability.
    return ok(spaces, "space.list.success");
  }

  async create(input: SpaceInput): Promise<ServiceResponse<Space>> {
    const row = await prisma.space.create({
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
    // TODO(F09-T02): write AuditEntry { action: "space.create", actor: req.actor }.
    return ok(toDto(row), "space.created");
  }

  async update(id: string, input: Partial<SpaceInput>): Promise<ServiceResponse<Space>> {
    const existing = await prisma.space.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound("common.not_found");
    const row = await prisma.space.update({ where: { id }, data: input });
    return ok(toDto(row), "space.updated");
  }
}

export const spacesService = new SpacesService();
