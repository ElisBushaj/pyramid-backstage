import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { vars } from "../../config/vars";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { Quote, QuoteStatus } from "../../types/api/quotes";
import { priceQuote } from "../../services/pricing";
import { writeAudit } from "../audit/audit.writer";
import { quoteToDto } from "./mapper";
import { assertQuoteTransition, effectiveStatus } from "./transitions";

const QUOTE_TTL_DAYS = 14;

interface GenerateInput {
  requestId: string;
  reservationId?: string;
  extraLineItems?: Array<{ label: string; qty: number; unitPriceMinor: number }>;
}

class QuotesService {
  async generate(actor: Actor, input: GenerateInput): Promise<ServiceResponse<Quote>> {
    const request = await prisma.eventRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw APIError.notFound();

    const reservation = input.reservationId
      ? await prisma.reservation.findUnique({ where: { id: input.reservationId }, include: { assets: true } })
      : await prisma.reservation.findFirst({ where: { requestId: input.requestId, status: { in: ["HELD", "CONFIRMED"] } }, include: { assets: true }, orderBy: { createdAt: "desc" } });
    // A quote prices a request + its reservation; with none to price (unknown id,
    // or no live HELD|CONFIRMED hold) we 404 rather than persist a net=0 quote (Q-13).
    if (!reservation) throw APIError.notFound();

    const space = await prisma.space.findUnique({ where: { id: reservation.spaceId } });
    const assetRates = new Map<string, { name: string; unitPriceMinor: number }>();
    if (reservation.assets.length) {
      const assets = await prisma.asset.findMany({ where: { id: { in: reservation.assets.map((a) => a.assetId) } } });
      for (const a of assets) assetRates.set(a.id, { name: a.name, unitPriceMinor: 0 }); // assets free (Q-03 default)
    }

    const priced = priceQuote({
      space: space ? { name: space.name, dayRateMinor: space.dayRateMinor } : null,
      reservation: { start: reservation.start, end: reservation.end, assets: reservation.assets.map((a) => ({ assetId: a.assetId, quantity: a.quantity })) },
      assetRates,
      extraLineItems: input.extraLineItems,
      vatRate: vars.vatRate,
    });

    const latest = await prisma.quote.findFirst({ where: { requestId: input.requestId }, orderBy: { version: "desc" } });
    const version = (latest?.version ?? 0) + 1;
    const expiresAt = new Date(Date.now() + QUOTE_TTL_DAYS * 86_400_000);

    const quote = await prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          requestId: input.requestId,
          currency: "ALL",
          lineItems: priced.lineItems as unknown as Prisma.InputJsonValue,
          netMinor: priced.netMinor,
          vatRate: priced.vatRate,
          vatMinor: priced.vatMinor,
          totalMinor: priced.totalMinor,
          status: "DRAFT",
          version,
          expiresAt,
        },
      });
      await writeAudit(tx, {
        actor, action: "quote.generate", entityType: "Quote", entityId: created.id, requestId: input.requestId,
        after: { version, netMinor: priced.netMinor, vatMinor: priced.vatMinor, totalMinor: priced.totalMinor },
      });
      return created;
    });
    return ok(quoteToDto(quote), "quote.generated");
  }

  /** Guarded status transition (F07-T04). No HTTP route in the contract yet. */
  async transition(actor: Actor, id: string, to: QuoteStatus): Promise<ServiceResponse<Quote>> {
    const q = await prisma.quote.findUnique({ where: { id } });
    if (!q) throw APIError.notFound();
    const from = effectiveStatus(q.status as QuoteStatus, q.expiresAt);
    if (to === "ACCEPTED" && from === "EXPIRED") {
      throw new APIError({ status: 409, error: "invalid_transition", messageKey: "quote.expired", from: "EXPIRED", to: "ACCEPTED" });
    }
    assertQuoteTransition(from, to);
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.quote.update({ where: { id }, data: { status: to } });
      await writeAudit(tx, { actor, action: "quote.transition", entityType: "Quote", entityId: id, requestId: q.requestId, before: { status: from }, after: { status: to } });
      return u;
    });
    return ok(quoteToDto(updated), "quote.generated");
  }
}

export const quotesService = new QuotesService();
