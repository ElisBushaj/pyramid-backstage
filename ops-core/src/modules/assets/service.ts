import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { Asset, AssetInput, AssetWithAvailability } from "../../types/api/assets";
import { writeAudit } from "../audit/audit.writer";
import { assetAvailability, assetHeldQuantities } from "../../services/availability";

type AssetRow = { id: string; name: string; type: string; totalQuantity: number; location: string; status: string };

export function assetToDto(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Asset["type"],
    totalQuantity: row.totalQuantity,
    location: row.location,
    status: row.status as Asset["status"],
  };
}

interface ListParams {
  type?: string;
  quantity?: number;
  start?: string;
  end?: string;
}

class AssetsService {
  /** Windowed availability list (CONFLICTS.md): availableQuantity = total − Σ holds. */
  async list(p: ListParams): Promise<ServiceResponse<AssetWithAvailability[]>> {
    const rows = await prisma.asset.findMany({
      where: { ...(p.type ? { type: p.type as Asset["type"] } : {}) },
      orderBy: { name: "asc" },
    });

    let avail: Map<string, number>;
    if (p.start && p.end) {
      avail = await assetAvailability(rows, new Date(p.start), new Date(p.end));
    } else {
      avail = new Map(rows.map((r) => [r.id, r.status === "ACTIVE" ? r.totalQuantity : 0]));
    }

    let result: AssetWithAvailability[] = rows.map((r) => ({ ...assetToDto(r), availableQuantity: avail.get(r.id) ?? 0 }));
    // [assumption] `quantity` filters to lines that can satisfy the demand.
    if (p.quantity !== undefined) result = result.filter((a) => (a.availableQuantity ?? 0) >= p.quantity!);
    return ok(result, "asset.list.success");
  }

  async create(actor: Actor, input: AssetInput): Promise<ServiceResponse<Asset>> {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.asset.create({
        data: { name: input.name, type: input.type, totalQuantity: input.totalQuantity, location: input.location, status: input.status ?? "ACTIVE" },
      });
      await writeAudit(tx, {
        actor, action: "asset.create", entityType: "Asset", entityId: created.id,
        after: { name: created.name, type: created.type, totalQuantity: created.totalQuantity },
      });
      return created;
    });
    return ok(assetToDto(row), "asset.created");
  }

  async update(actor: Actor, id: string, input: Partial<AssetInput>): Promise<ServiceResponse<Asset>> {
    const existing = await prisma.asset.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound();

    if (input.totalQuantity !== undefined && input.totalQuantity < existing.totalQuantity) {
      const peak = await this.peakConcurrentHold(id);
      if (input.totalQuantity < peak) {
        throw APIError.validation({ totalQuantity: "asset.update.below_holds" });
      }
    }

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({ where: { id }, data: input });
      await writeAudit(tx, {
        actor, action: "asset.update", entityType: "Asset", entityId: id,
        before: { totalQuantity: existing.totalQuantity, status: existing.status },
        after: { totalQuantity: updated.totalQuantity, status: updated.status },
      });
      return updated;
    });
    return ok(assetToDto(row), "asset.updated");
  }

  /** Max concurrent live (HELD-live|CONFIRMED) demand for this asset across all windows. */
  private async peakConcurrentHold(assetId: string): Promise<number> {
    const now = new Date();
    const holds = await prisma.reservationAsset.findMany({
      where: { assetId, reservation: { OR: [{ status: "CONFIRMED" }, { status: "HELD", expiresAt: { gt: now } }] } },
      include: { reservation: { select: { effectiveStart: true, effectiveEnd: true } } },
    });
    let peak = 0;
    for (const h of holds) {
      const m = await assetHeldQuantities(prisma, [assetId], h.reservation.effectiveStart, h.reservation.effectiveEnd);
      peak = Math.max(peak, m.get(assetId) ?? 0);
    }
    return peak;
  }
}

export const assetsService = new AssetsService();
