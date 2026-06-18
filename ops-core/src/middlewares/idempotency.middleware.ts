import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { APIError } from "../errors";

const TTL_HOURS = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Idempotency for unsafe methods (ADR-0005). Requires a UUID Idempotency-Key.
 * A replay with the same key + same body returns the ORIGINAL response (the
 * mutation never re-runs); the same key with a different body → 409
 * idempotency_key_mismatch. Keyed per route+key so unrelated routes don't
 * collide. Stored in Postgres (the IdempotencyKey table) with a 24h TTL — the
 * store could move to Redis without changing this contract.
 */
export function withIdempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const headerKey = req.header("Idempotency-Key");
    if (!headerKey || !UUID_RE.test(headerKey)) {
      return next(
        new APIError({ status: 422, error: "validation", messageKey: "validation.failed", fields: { "Idempotency-Key": headerKey ? "validation.uuid" : "validation.required" } }),
      );
    }
    const path = req.originalUrl.split("?")[0];
    const storeKey = `${req.method} ${path} :: ${headerKey}`;
    const requestHash = crypto.createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

    const existing = await prisma.idempotencyKey.findUnique({ where: { key: storeKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) return next(APIError.idempotencyKeyMismatch());
      res.status(existing.statusCode).json(existing.response);
      return;
    }

    // Capture the response to cache it once sent (only for success-ish writes).
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode < 400) {
        void prisma.idempotencyKey
          .create({
            data: { key: storeKey, requestHash, response: body as object, statusCode: res.statusCode, expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000) },
          })
          .catch(() => undefined);
      }
      return originalJson(body);
    };
    next();
  };
}
