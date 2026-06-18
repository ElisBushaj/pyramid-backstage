import type { Quote, LineItem } from "../../types/api/quotes";

export interface QuoteRow {
  id: string;
  requestId: string;
  currency: string;
  lineItems: unknown;
  netMinor: number;
  vatRate: number;
  vatMinor: number;
  totalMinor: number;
  status: string;
  version: number;
  expiresAt: Date | null;
  createdAt: Date;
}

export function quoteToDto(row: QuoteRow): Quote {
  return {
    id: row.id,
    requestId: row.requestId,
    currency: row.currency as "ALL",
    lineItems: (row.lineItems ?? []) as LineItem[],
    netMinor: row.netMinor,
    vatRate: row.vatRate,
    vatMinor: row.vatMinor,
    totalMinor: row.totalMinor,
    status: row.status as Quote["status"],
    version: row.version,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
