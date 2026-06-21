/** Mirrors openapi.yaml Reservation schemas. Frontend mirrors in api/types/reservations.ts. */
import type { DateRange } from "./conflicts";

export type ReservationStatus = "HELD" | "CONFIRMED" | "RELEASED";

export interface ReservedAsset {
  assetId: string;
  quantity: number;
}

export interface Reservation {
  id: string;
  requestId: string;
  spaceId: string;
  dateRange: DateRange;
  effectiveStart?: string;
  effectiveEnd?: string;
  assets: ReservedAsset[];
  status: ReservationStatus;
  expiresAt?: string | null;
  createdById?: string | null;
  createdAt?: string;
}

export interface ReservationInput {
  requestId: string;
  spaceId: string;
  dateRange: DateRange;
  assets?: ReservedAsset[];
  holdMinutes?: number;
}

/**
 * A live reservation window for the schedule timelines (ADR-0016). Returned by
 * GET /private/reservations?start&end[&spaceId][&status] — the bar a space lane
 * draws for a [start,end] occupancy. Only live holds (CONFIRMED, or HELD whose
 * lease has not lapsed) appear.
 */
export interface ScheduleEntry {
  id: string;
  spaceId: string;
  requestId: string;
  requestTitle: string;
  attendees: number;
  status: "HELD" | "CONFIRMED";
  start: string;
  end: string;
  setupBufferMinutes: number;
  teardownBufferMinutes: number;
}
