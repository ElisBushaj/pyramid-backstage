import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, okList, type ServiceResponse, type ListResponse, type Actor } from "../../types";
import type {
  Asset, AssetInput, AssetWithAvailability,
  AssetMovement, AssetScanInput, AssetScanResult,
} from "../../types/api/assets";
import { writeAudit } from "../audit/audit.writer";
import { writeOutbox } from "../events/outbox.writer";
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

type AssetMovementRow = {
  id: string; assetId: string; action: string; quantity: number;
  fromLocation: string | null; toLocation: string; reservationId: string | null;
  actorId: string | null; note: string | null; at: Date;
};

export function assetMovementToDto(row: AssetMovementRow): AssetMovement {
  return {
    id: row.id, assetId: row.assetId, action: row.action as AssetMovement["action"],
    quantity: row.quantity, fromLocation: row.fromLocation, toLocation: row.toLocation,
    reservationId: row.reservationId, actorId: row.actorId, note: row.note, at: row.at.toISOString(),
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

    // F16 — live-tracking rollup: net units checked out + last-moved, per asset.
    const [grouped, lastMoved] = await Promise.all([
      prisma.assetMovement.groupBy({ by: ["assetId", "action"], _sum: { quantity: true } }),
      prisma.assetMovement.groupBy({ by: ["assetId"], _max: { at: true } }),
    ]);
    const netMap = this.netFromGroups(grouped);
    const lastMap = new Map(lastMoved.map((g) => [g.assetId, g._max.at]));

    let result: AssetWithAvailability[] = rows.map((r) => ({
      ...assetToDto(r),
      availableQuantity: avail.get(r.id) ?? 0,
      checkedOutQuantity: netMap.get(r.id) ?? 0,
      ...(lastMap.get(r.id) ? { lastMovedAt: lastMap.get(r.id)!.toISOString() } : {}),
    }));
    // [assumption] `quantity` filters to lines that can satisfy the demand.
    if (p.quantity !== undefined) result = result.filter((a) => (a.availableQuantity ?? 0) >= p.quantity!);
    return ok(result, "asset.list.success");
  }

  /** Net units currently checked out per asset = Σ CHECK_OUT − Σ CHECK_IN (floored at 0). */
  private netFromGroups(groups: Array<{ assetId: string; action: string; _sum: { quantity: number | null } }>): Map<string, number> {
    const m = new Map<string, number>();
    for (const g of groups) {
      const q = g._sum.quantity ?? 0;
      const delta = g.action === "CHECK_OUT" ? q : g.action === "CHECK_IN" ? -q : 0;
      m.set(g.assetId, (m.get(g.assetId) ?? 0) + delta);
    }
    for (const [k, v] of m) m.set(k, Math.max(0, v));
    return m;
  }

  /**
   * F16 — record a QR/NFC scan: append an AssetMovement, update the live location,
   * audit + emit `asset.moved`, all in one transaction. Guards over-checkout (you
   * can't have more units out than exist) and over-check-in. See ASSET_TRACKING.md.
   */
  async scan(actor: Actor, assetId: string, input: AssetScanInput): Promise<ServiceResponse<AssetScanResult>> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw APIError.notFound();
    if (!Number.isInteger(input.quantity) || input.quantity < 1) throw APIError.validation({ quantity: "validation.min" });

    const out = await prisma.$transaction(async (tx) => {
      const grouped = await tx.assetMovement.groupBy({ by: ["assetId", "action"], where: { assetId }, _sum: { quantity: true } });
      const net = this.netFromGroups(grouped).get(assetId) ?? 0;
      if (input.action === "CHECK_OUT" && net + input.quantity > asset.totalQuantity) {
        throw APIError.validation({ quantity: "asset.scan.over_checkout" });
      }
      if (input.action === "CHECK_IN" && input.quantity > net) {
        throw APIError.validation({ quantity: "asset.scan.over_checkin" });
      }
      const movement = await tx.assetMovement.create({
        data: {
          assetId, action: input.action, quantity: input.quantity,
          fromLocation: asset.location, toLocation: input.toLocation,
          reservationId: input.reservationId ?? null, actorId: actor.id, note: input.note ?? null,
        },
      });
      const updated = await tx.asset.update({ where: { id: assetId }, data: { location: input.toLocation } });
      await writeAudit(tx, {
        actor, action: "asset.scan", entityType: "Asset", entityId: assetId,
        before: { location: asset.location }, after: { location: input.toLocation },
        reason: `${input.action} ${input.quantity} → ${input.toLocation}`,
      });
      await writeOutbox(tx, "asset.moved", {
        assetId, action: input.action, quantity: input.quantity,
        fromLocation: asset.location, toLocation: input.toLocation, reservationId: input.reservationId ?? null,
      });
      const newNet = input.action === "CHECK_OUT" ? net + input.quantity : input.action === "CHECK_IN" ? net - input.quantity : net;
      return { updated, movement, newNet };
    });

    const dto: AssetWithAvailability = {
      ...assetToDto(out.updated),
      checkedOutQuantity: out.newNet,
      lastMovedAt: out.movement.at.toISOString(),
    };
    return ok({ asset: dto, movement: assetMovementToDto(out.movement) }, "asset.scanned");
  }

  /** F16 — the per-asset movement ledger, newest first (paginated). */
  async movements(assetId: string, page = 1, pageSize = 50): Promise<ListResponse<AssetMovement>> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) throw APIError.notFound();
    const size = Math.min(Math.max(1, pageSize), 100);
    const [rows, total] = await Promise.all([
      prisma.assetMovement.findMany({ where: { assetId }, orderBy: { at: "desc" }, skip: (page - 1) * size, take: size }),
      prisma.assetMovement.count({ where: { assetId } }),
    ]);
    return okList(rows.map(assetMovementToDto), total, page, size, "asset.movements.success");
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
