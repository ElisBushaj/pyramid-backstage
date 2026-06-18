import crypto from "node:crypto";
import { prisma } from "../../config/prisma";
import { vars } from "../../config/vars";
import type { Actor } from "../../types";

export const SESSION_COOKIE = "pb_session";
export const CSRF_COOKIE = "pb_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Opaque session token (the cookie value); only its hash is persisted. */
export function newToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export interface IssuedSession {
  token: string;
  csrf: string;
  expiresAt: Date;
}

/** Create a server-side Session row; returns the raw token + a CSRF token. */
export async function createSession(userId: string): Promise<IssuedSession> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + vars.sessionTtlHours * 3_600_000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, csrf: newToken(), expiresAt };
}

/**
 * Resolve a raw session token to the live Actor, or null. An expired session is
 * treated as no session and is reaped on read so it can never be reused.
 */
export async function resolveActor(token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { tokenHash } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;
  return { id: session.user.id, name: session.user.name, role: session.user.role };
}

/** Destroy a session by its raw token (logout). Idempotent. */
export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** Cookie options for the httpOnly signed session cookie. */
export function sessionCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true as const,
    signed: true as const,
    sameSite: "lax" as const,
    secure: vars.isProd,
    path: "/",
    maxAge: maxAgeMs,
  };
}

/** The CSRF cookie is readable by the SPA (double-submit) — not httpOnly. */
export function csrfCookieOptions(maxAgeMs: number) {
  return { httpOnly: false as const, sameSite: "lax" as const, secure: vars.isProd, path: "/", maxAge: maxAgeMs };
}
