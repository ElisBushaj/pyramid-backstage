import type { Reservation } from "../../types/api/reservations";

export interface ReservationRow {
  id: string;
  requestId: string;
  spaceId: string;
  start: Date;
  end: Date;
  effectiveStart: Date;
  effectiveEnd: Date;
  status: string;
  expiresAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  assets?: Array<{ assetId: string; quantity: number }>;
}

export function reservationToDto(row: ReservationRow): Reservation {
  return {
    id: row.id,
    requestId: row.requestId,
    spaceId: row.spaceId,
    dateRange: { start: row.start.toISOString(), end: row.end.toISOString() },
    effectiveStart: row.effectiveStart.toISOString(),
    effectiveEnd: row.effectiveEnd.toISOString(),
    assets: (row.assets ?? []).map((a) => ({ assetId: a.assetId, quantity: a.quantity })),
    status: row.status as Reservation["status"],
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
  };
}
