// Mirrors ops-core/src/types/api/assets.ts.
export type AssetType =
  | 'SEATING'
  | 'TABLE'
  | 'MICROPHONE'
  | 'SCREEN'
  | 'PROJECTOR'
  | 'STAGE_UNIT'
  | 'LIGHTING'
  | 'OTHER'
export type AssetStatus = 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'

export interface Asset {
  id: string
  name: string
  type: AssetType
  totalQuantity: number
  location: string
  status: AssetStatus
}

export interface AssetWithAvailability extends Asset {
  availableQuantity?: number
  // F16 — live tracking rollup.
  checkedOutQuantity?: number
  lastMovedAt?: string
}

export interface AssetInput {
  name: string
  type: AssetType
  totalQuantity: number
  location: string
  status?: AssetStatus
}

// F16 — QR/NFC asset tracking (aggregate-with-movement).
export type AssetMovementAction = 'CHECK_OUT' | 'CHECK_IN' | 'RELOCATE'

export interface AssetMovement {
  id: string
  assetId: string
  action: AssetMovementAction
  quantity: number
  fromLocation?: string | null
  toLocation: string
  reservationId?: string | null
  actorId?: string | null
  note?: string | null
  at: string
}

export interface AssetScanInput {
  action: AssetMovementAction
  quantity: number
  toLocation: string
  reservationId?: string
  note?: string
}

export interface AssetScanResult {
  asset: AssetWithAvailability
  movement: AssetMovement
}
