/** Mirrors openapi.yaml Space schemas. Frontend mirrors this in api/types/spaces.ts. */
export type Layout = "THEATER" | "CLASSROOM" | "BANQUET" | "RECEPTION" | "CABARET" | "BOARDROOM" | "CUSTOM";
export type SpaceKind = "MAIN" | "TRANSITIONAL";
export type SpaceCategory = "HALL" | "BOX" | "CORRIDOR" | "ATRIUM" | "ENTRANCE" | "TERRACE" | "TRANSITIONAL";

/** Schematic radial placement for the FloorMap (catalog `map`). Circulation cores omit sectors. */
export interface SpaceMap {
  floor: number;
  ring: string;
  sectorFrom?: number;
  sectorTo?: number;
}

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
  // Catalog-extension fields (F14 / ADR-0013) — additive, optional.
  slug?: string;
  category?: SpaceCategory;
  zone?: string;
  isCirculation?: boolean;
  adjacent?: string[];
  map?: SpaceMap;
  ceilingCm?: number;
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
  // Catalog-extension fields (F14) — optional via the API; primarily seed-populated.
  slug?: string;
  category?: SpaceCategory;
  zone?: string;
  isCirculation?: boolean;
  adjacent?: string[];
  map?: SpaceMap;
  ceilingCm?: number;
}
