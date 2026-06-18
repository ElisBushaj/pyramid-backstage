/** Mirrors openapi.yaml Asset schemas. Frontend mirrors in api/types/assets.ts. */
export type AssetType =
  | "SEATING"
  | "TABLE"
  | "MICROPHONE"
  | "SCREEN"
  | "PROJECTOR"
  | "STAGE_UNIT"
  | "LIGHTING"
  | "OTHER";
export type AssetStatus = "ACTIVE" | "MAINTENANCE" | "RETIRED";

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  totalQuantity: number;
  location: string;
  status: AssetStatus;
}

export interface AssetWithAvailability extends Asset {
  availableQuantity?: number;
}

export interface AssetInput {
  name: string;
  type: AssetType;
  totalQuantity: number;
  location: string;
  status?: AssetStatus;
}
