/** Mirrors openapi.yaml #/components/schemas/Conflict + DateRange. */
export interface DateRange {
  start: string; // RFC-3339 UTC
  end: string;
}

export type ConflictType =
  | "SPACE_DOUBLE_BOOKED"
  | "ASSET_OVERALLOCATED"
  | "SETUP_WINDOW_OVERLAP";

export interface Conflict {
  type: ConflictType;
  spaceId?: string;
  assetId?: string;
  requested?: number;
  available?: number;
  conflictingRequestIds?: string[];
  window: DateRange;
  detail: string;
}
