/** Mirrors openapi.yaml Space schemas. Frontend mirrors this in api/types/spaces.ts. */
export type Layout = "THEATER" | "CLASSROOM" | "BANQUET" | "RECEPTION" | "CABARET" | "BOARDROOM" | "CUSTOM";
export type SpaceKind = "MAIN" | "TRANSITIONAL";

export interface Space {
  id: string;
  name: string;
  floor: number;
  kind: SpaceKind;
  capacities: Record<string, number>;
  features: string[];
  dayRateMinor: number;
  currency: "ALL";
  setupBufferMinutes: number;
  teardownBufferMinutes: number;
  status: "ACTIVE" | "INACTIVE";
}

export interface SpaceWithAvailability extends Space {
  available?: boolean;
}

export interface SpaceInput {
  name: string;
  floor: number;
  kind?: SpaceKind;
  capacities: Record<string, number>;
  features?: string[];
  dayRateMinor: number;
  setupBufferMinutes?: number;
  teardownBufferMinutes?: number;
}
