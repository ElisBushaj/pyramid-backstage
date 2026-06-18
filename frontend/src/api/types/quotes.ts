// Mirrors ops-core/src/types/api/quotes.ts.
export type LineItemKind = 'SPACE' | 'ASSET' | 'SERVICE'
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'EXPIRED'

export interface LineItem {
  label: string
  kind: LineItemKind
  qty: number
  unitPriceMinor: number
  subtotalMinor: number
}

export interface LineItemInput {
  label: string
  qty: number
  unitPriceMinor: number
}

export interface Quote {
  id: string
  requestId: string
  currency: 'ALL'
  lineItems: LineItem[]
  netMinor: number
  vatRate: number
  vatMinor: number
  totalMinor: number
  status: QuoteStatus
  version: number
  expiresAt?: string | null
  createdAt?: string
}
