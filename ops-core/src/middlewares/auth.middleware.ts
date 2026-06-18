import type { NextFunction, Request, Response } from "express";
import { APIError } from "../errors";
import type { Actor } from "../types";
import { resolveActor, SESSION_COOKIE } from "../modules/auth/session";

/**
 * Resolve the signed pb_session cookie → a live Session+User → req.actor.
 * Missing/expired/invalid session → 401. An expired session is reaped on read
 * (see session.ts) so it cannot be reused. (F01-T04)
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.signedCookies?.[SESSION_COOKIE] as string | undefined;
    const actor = await resolveActor(token);
    if (!actor) return next(APIError.unauthorized());
    req.actor = actor;
    next();
  } catch (err) {
    next(err);
  }
}

const RANK: Record<Actor["role"], number> = { VIEWER: 0, OPS: 1, MANAGER: 2, ADMIN: 3 };

/**
 * Require at least the given role on the total ladder ADMIN > MANAGER > OPS >
 * VIEWER. Runs after requireAuth, so below-floor → 403 (a missing session is
 * already 401). (F01-T05)
 */
export function requireRole(min: Actor["role"]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) return next(APIError.unauthorized());
    if (RANK[req.actor.role] < RANK[min]) return next(new APIError({ status: 403, error: "forbidden", messageKey: "auth.forbidden" }));
    next();
  };
}

/** The contract's named per-route gates, so call sites read declaratively. */
export const requirePermission = {
  approve: requireRole("MANAGER"),
  manageInventory: requireRole("OPS"),
  manageSpaces: requireRole("OPS"),
  manageUsers: requireRole("ADMIN"),
} as const;
