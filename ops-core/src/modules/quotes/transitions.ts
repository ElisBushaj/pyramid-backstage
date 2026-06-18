import { APIError } from "../../errors";
import type { QuoteStatus } from "../../types/api/quotes";

export const LEGAL_QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT", "EXPIRED"],
  SENT: ["ACCEPTED", "EXPIRED"],
  ACCEPTED: [],
  EXPIRED: [],
};

export function isLegalQuoteTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return LEGAL_QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!isLegalQuoteTransition(from, to)) {
    throw APIError.invalidTransition(from, to, "quote.invalid_transition");
  }
}

/** Check-on-read: a non-terminal quote past its expiry reads as EXPIRED. */
export function effectiveStatus(status: QuoteStatus, expiresAt: Date | null, now = new Date()): QuoteStatus {
  if ((status === "DRAFT" || status === "SENT") && expiresAt && expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return status;
}
