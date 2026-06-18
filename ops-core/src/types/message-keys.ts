/**
 * The single source list of every i18n messageKey in ops-core. Both
 * `locales/al.json` and `locales/en.json` must define exactly this set — the
 * parity test (`i18n.test.ts`) fails the build on any drift. Append new keys
 * here AND to both locale files (alphabetical within a namespace). Never
 * reference a messageKey that is not registered here.
 */
export const MESSAGE_KEYS = [
  // ── common / errors ────────────────────────────────────────────────────────
  "common.ok",
  "common.unauthorized",
  "common.forbidden",
  "common.not_found",
  "common.bad_request",
  "common.invalid_transition",
  "common.idempotency_mismatch",
  "common.rate_limited",
  "common.internal",
  // ── validation ─────────────────────────────────────────────────────────────
  "validation.failed",
  "validation.required",
  "validation.invalid",
  "validation.int",
  "validation.min",
  "validation.max",
  "validation.object",
  "validation.array",
  "validation.length",
  "validation.email",
  "validation.enum",
  "validation.datetime",
  "validation.range",
  "validation.uuid",
  // ── auth ───────────────────────────────────────────────────────────────────
  "auth.login.success",
  "auth.login.invalid",
  "auth.logout.success",
  "auth.me.success",
  "auth.forbidden",
  "auth.rate_limited",
  "auth.csrf_invalid",
  // ── users (admin) ──────────────────────────────────────────────────────────
  "user.list.success",
  "user.created",
  "user.updated",
  "user.email_taken",
  // ── spaces ─────────────────────────────────────────────────────────────────
  "space.created",
  "space.updated",
  "space.list.success",
  "space.availability.success",
  // ── assets ─────────────────────────────────────────────────────────────────
  "asset.list.success",
  "asset.created",
  "asset.updated",
  "asset.update.below_holds",
  // ── requests ───────────────────────────────────────────────────────────────
  "request.created.success",
  "request.aggregate.success",
  "request.list.success",
  "request.updated",
  "request.approved",
  "request.rejected",
  "request.invalid_transition",
  // ── reservations ───────────────────────────────────────────────────────────
  "reservation.held",
  "reservation.confirmed",
  "reservation.released",
  "reservation.conflict",
  "reservation.expired",
  "reservation.invalid_transition",
  // ── quotes ─────────────────────────────────────────────────────────────────
  "quote.generated",
  "quote.invalid_transition",
  "quote.expired",
  // ── tasks ──────────────────────────────────────────────────────────────────
  "tasks.created",
  "tasks.list.success",
  "task.updated",
  // ── conflicts ──────────────────────────────────────────────────────────────
  "conflict.list.success",
  // ── audit ──────────────────────────────────────────────────────────────────
  "audit.list.success",
  // ── dashboard ──────────────────────────────────────────────────────────────
  "dashboard.stats.success",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];
