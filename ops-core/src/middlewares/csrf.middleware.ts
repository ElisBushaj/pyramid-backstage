import type { NextFunction, Request, Response } from "express";
import { APIError } from "../errors";
import { CSRF_COOKIE, CSRF_HEADER } from "../modules/auth/session";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Double-submit CSRF guard for cookie-authenticated mutations. The SPA reads the
 * non-httpOnly pb_csrf cookie (set at login) and echoes it in the x-csrf-token
 * header; a request whose header doesn't match the cookie is rejected before the
 * handler runs. Safe methods are exempt. Mounted on the /private tier after
 * requireAuth (so a missing session is 401, not 403). (F01-T06)
 */
export function requireCsrf(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE.has(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.header(CSRF_HEADER);
  if (!cookie || !header || cookie !== header) {
    return next(new APIError({ status: 403, error: "forbidden", messageKey: "auth.csrf_invalid" }));
  }
  next();
}
