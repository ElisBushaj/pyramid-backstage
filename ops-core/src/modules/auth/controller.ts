import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { ok } from "../../types";
import { authService } from "./service";
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  csrfCookieOptions,
  destroySession,
  sessionCookieOptions,
} from "./session";

export class AuthController {
  @controlledResponse("post", 200) // login returns 200: a session, not a created resource
  static async login(req: Request, res: Response) {
    const { user, session } = await authService.login(req.body.email, req.body.password);
    const maxAge = session.expiresAt.getTime() - Date.now();
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(maxAge));
    res.cookie(CSRF_COOKIE, session.csrf, csrfCookieOptions(maxAge));
    return ok(user, "auth.login.success");
  }

  @controlledResponse("post", 200)
  static async logout(req: Request, res: Response) {
    await destroySession(req.signedCookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(CSRF_COOKIE, { path: "/" });
    return ok(null, "auth.logout.success");
  }

  @controlledResponse("get")
  static async me(req: Request, _res: Response) {
    return authService.me(req.actor!.id);
  }
}
