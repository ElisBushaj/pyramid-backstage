import type { NextFunction, Request, Response } from "express";
import { APIError } from "../errors";
import type { Actor } from "../types";

/**
 * F01 lands the real implementation (resolve the pb_session cookie → Session →
 * User → req.actor). This scaffold establishes the contract every private route
 * relies on: requireAuth populates req.actor; requireRole gates beyond the tier.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // TODO(F01-T04): resolve session cookie → req.actor. Until then, reject.
  if (!req.actor) {
    next(APIError.unauthorized());
    return;
  }
  next();
}

const RANK: Record<Actor["role"], number> = { VIEWER: 0, OPS: 1, MANAGER: 2, ADMIN: 3 };

/** Require at least the given role. Admins always pass. */
export function requireRole(min: Actor["role"]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) return next(APIError.unauthorized());
    if (RANK[req.actor.role] < RANK[min]) return next(APIError.forbidden());
    next();
  };
}
