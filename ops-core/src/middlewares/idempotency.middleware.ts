import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { APIError } from "../errors";

const TTL_HOURS = 24;

/**
 * Idempotency for unsafe methods. A replay of the same key returns the original
 * response; the same key with a different body → 409. See ADR-0005.
 * F06-T03 may move the store to Redis; the contract is identical.
 */
export function withIdempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      return next(
        new APIError({ status: 422, error: "validation", messageKey: "validation.failed", fields: { "Idempotency-Key": "validation.required" } }),
      );
    }
    const requestHash = crypto.createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");

    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        return next(new APIError({ status: 409, error: "idempotency_key_mismatch", messageKey: "common.invalid_transition" }));
      }
      res.status(existing.statusCode).json(existing.response);
      return;
    }

    // Capture the response to cache it once sent.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void prisma.idempotencyKey
        .create({
          data: {
            key,
            requestHash,
            response: body as object,
            statusCode: res.statusCode,
            expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000),
          },
        })
        .catch(() => undefined);
      return originalJson(body);
    };
    next();
  };
}
