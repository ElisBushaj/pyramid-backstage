import { prisma } from "../../config/prisma";
import { ok, type ServiceResponse } from "../../types";
import type { DashboardStats } from "../../types/api/requests";

const WEEK_MS = 7 * 86_400_000;

class DashboardService {
  /** KPI read-model for the Command Center — each tile is one aggregate, no N+1. */
  async stats(): Promise<ServiceResponse<DashboardStats>> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const twoWeeksAgo = new Date(now.getTime() - 2 * WEEK_MS);

    const [thisWeek, lastWeek, inUse, totalSpaces, pending, lowStock] = await Promise.all([
      prisma.eventRequest.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.eventRequest.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.reservation.findMany({ where: { OR: [{ status: "CONFIRMED" }, { status: "HELD", expiresAt: { gt: now } }] }, distinct: ["spaceId"], select: { spaceId: true } }),
      prisma.space.count({ where: { status: "ACTIVE" } }),
      prisma.eventRequest.count({ where: { status: "PROPOSED" } }),
      prisma.$queryRaw<Array<{ low: number }>>`
        SELECT count(*)::int AS low FROM "Asset" a
        WHERE a.status = 'ACTIVE' AND (
          SELECT COALESCE(SUM(ra.quantity), 0) FROM "ReservationAsset" ra
          JOIN "Reservation" r ON r.id = ra."reservationId"
          WHERE ra."assetId" = a.id AND (r.status = 'CONFIRMED' OR (r.status = 'HELD' AND r."expiresAt" > NOW()))
        ) >= a."totalQuantity" * 0.9`,
    ]);

    const stats: DashboardStats = {
      eventsThisWeek: { value: thisWeek, delta: thisWeek - lastWeek, hint: "new requests this week vs last" },
      spacesInUse: { inUse: inUse.length, total: totalSpaces },
      lowStockAssets: { value: lowStock[0]?.low ?? 0, hint: "asset lines ≥90% committed" },
      pendingApprovals: { value: pending, hint: "requests awaiting a manager" },
    };
    return ok(stats, "dashboard.stats.success");
  }
}

export const dashboardService = new DashboardService();
