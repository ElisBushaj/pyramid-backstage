/** Mirrors openapi.yaml Space schemas. Frontend mirrors this in api/types/spaces.ts. */
export type Layout = "THEATER" | "CLASSROOM" | "BANQUET" | "RECEPTION" | "CABARET" | "BOARDROOM" | "CUSTOM";
export type SpaceKind = "MAIN" | "TRANSITIONAL";
export type SpaceCategory = "HALL" | "BOX" | "CORRIDOR" | "ATRIUM" | "ENTRANCE" | "TERRACE" | "TRANSITIONAL";

export type SpaceKind2 =
  | "main_hall" | "annex_hall" | "perimeter_hall" | "mid_ring_hall"
  | "box" | "rim_room" | "outdoor_terrace" | "outdoor_stairs"
  | "circulation" | "circulation_feature" | "entrance_plaza" | "entrance_vestibule"
  | "wc" | "technical";

/** Real-plan placement for the FloorMap (catalog `map`). Circulation cores omit sectors. */
export interface SpaceMap {
  floor: number;
  ring: string;
  sectorFrom?: number;
  sectorTo?: number;
  // F19-v2 (real-plan mode): traced room polygon in the floor's 0..1000 viewBox.
  // Additive; radial fields stay for the v1 schematic map.
  polygon?: number[][];
  // Real floor model (architect spec): bearing 0=N clockwise; level = m vs Floor-0 datum.
  bearing?: number;
  level?: number;
  levelRange?: [number, number];
  ceilingMeters?: number;
  areaApproxM2?: number;
  areaEstimated?: boolean;
  bookable?: boolean | "conditional"; // HARD filter: false = wc/technical/circulation
  spaceKind?: SpaceKind2;
  outdoor?: boolean;
  weatherDependent?: boolean;
  stepped?: boolean;
  note?: string;
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
