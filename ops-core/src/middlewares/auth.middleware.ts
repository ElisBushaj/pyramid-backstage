import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { vars } from "../config/vars";
import { APIError } from "../errors";
import type { Actor } from "../types";
import { resolveActor, SESSION_COOKIE } from "../modules/auth/session";

// Total role ladder PARTNER < VIEWER < OPS < MANAGER < ADMIN. PARTNER (F15) grants
// nothing on the staff tool surface — see ADR-0010.
const RANK: Record<Actor["role"], number> = { PARTNER: -1, VIEWER: 0, OPS: 1, MANAGER: 2, ADMIN: 3 };

// F17 — when the AI acts via the service token it may never exceed this role,
// even when the forwarded staff user is an ADMIN. A compromised AI cannot self-grant
// ADMIN operations. See docs/08-decisions/0012-ai-ops-core-service-token-auth.md.
const SERVICE_ACTOR_CEILING: Actor["role"] = "MANAGER";

/**
 * F17 — service-token auth. When the `Authorization: Bearer <OPS_CORE_SERVICE_TOKEN>`
 * matches, ops-core trusts the AI as a system caller but ACTS AS the forwarded staff
 * user (X-Acting-User-Id / X-Acting-User-Role) so audit attribution + partner row-scoping
 * stay correct. The forwarded role may not exceed the user's real role nor the ceiling.
 * Returns null when no/!matching service token is presented (fall through to the cookie).
 */
async function resolveServiceActor(req: Request): Promise<Actor | null> {
  const header = req.headers.authorization;
  if (!vars.serviceToken || !header?.startsWith("Bearer ")) return null;
  if (header.slice("Bearer ".length).trim() !== vars.serviceToken) return null; // not our token → session path

  const actingId = req.header("X-Acting-User-Id");
  const actingRole = req.header("X-Acting-User-Role") as Actor["role"] | undefined;
  if (!actingId || !actingRole || !(actingRole in RANK)) throw APIError.unauthorized();

  const user = await prisma.user.findUnique({ where: { id: actingId } });
  if (!user || !user.isActive) throw APIError.unauthorized();

  // No escalation: the forwarded role can't exceed the user's real role, nor the ceiling.
  if (RANK[actingRole] > RANK[user.role as Actor["role"]] || RANK[actingRole] > RANK[SERVICE_ACTOR_CEILING]) {
    throw new APIError({ status: 403, error: "forbidden", messageKey: "auth.forbidden" });
  }
  return { id: user.id, name: user.name, role: actingRole };
}

/**
 * Resolve the caller → req.actor. Tries the F17 service-token path first (the AI),
 * then the signed pb_session cookie → a live Session+User. Missing/expired/invalid →
 * 401. An expired session is reaped on read (see session.ts). (F01-T04)
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const serviceActor = await resolveServiceActor(req);
    if (serviceActor) {
      req.actor = serviceActor;
      req.serviceAuth = true;
      return next();
    }
    const token = req.signedCookies?.[SESSION_COOKIE] as string | undefined;
    const actor = await resolveActor(token);
    if (!actor) return next(APIError.unauthorized());
    req.actor = actor;
    next();
  } catch (err) {
    next(err);
  }
}

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
