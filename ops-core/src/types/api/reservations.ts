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
