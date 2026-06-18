import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { APIError } from "../errors";
import { vars } from "../config/vars";

/**
 * Per-identifier limiter for login. Keyed by IP + submitted email so one
 * attacker can't lock out an account globally; window-based reset means a
 * correct login is never permanently blocked. Over the threshold → 429.
 */
export function loginRateLimiter(limitOverride?: number) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit: limitOverride ?? (vars.isTest ? 1000 : 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.email ?? "").toLowerCase()}`,
    handler: (_req, _res, next) => next(APIError.rateLimited("auth.rate_limited")),
  });
}
