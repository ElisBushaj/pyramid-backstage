import type { Conflict } from "../types/api/conflicts";

/** Base error carrying an HTTP status. */
export class ExtendableError extends Error {
  public status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

export interface APIErrorOptions {
  status?: number;
  message?: string;
  /** i18n key resolved by the response layer against the active locale. */
  messageKey: string;
  messageParams?: Record<string, string | number>;
  /** machine-readable error code in the error contract (e.g. "conflict"). */
  error?: string;
  /** structured extras for specific errors */
  conflicts?: Conflict[];
  from?: string;
  to?: string;
  fields?: Record<string, string>;
}

/**
 * The only error type thrown on a request path. The @controlledResponse layer
 * maps it to the error contract in docs/04-api/ERROR_CONTRACT.md.
 */
export class APIError extends ExtendableError {
  public messageKey: string;
  public messageParams?: Record<string, string | number>;
  public error: string;
  public conflicts?: Conflict[];
  public from?: string;
  public to?: string;
  public fields?: Record<string, string>;

  constructor(opts: APIErrorOptions) {
    super(opts.message ?? opts.messageKey, opts.status ?? 500);
    this.messageKey = opts.messageKey;
    this.messageParams = opts.messageParams;
    this.error = opts.error ?? defaultErrorCode(opts.status ?? 500);
    this.conflicts = opts.conflicts;
    this.from = opts.from;
    this.to = opts.to;
    this.fields = opts.fields;
  }

  // ── factories for the canonical error contract ──────────────────────────────
  static unauthorized() {
    return new APIError({ status: 401, error: "unauthorized", messageKey: "common.unauthorized" });
  }
  static forbidden() {
    return new APIError({ status: 403, error: "forbidden", messageKey: "common.forbidden" });
  }
  static notFound(messageKey = "common.not_found") {
    return new APIError({ status: 404, error: "not_found", messageKey });
  }
  static validation(fields: Record<string, string>) {
    return new APIError({ status: 422, error: "validation", messageKey: "validation.failed", fields });
  }
  static conflict(conflicts: Conflict[], messageKey = "reservation.conflict") {
    return new APIError({ status: 409, error: "conflict", messageKey, conflicts });
  }
  static invalidTransition(from: string, to: string, messageKey = "common.invalid_transition") {
    return new APIError({ status: 409, error: "invalid_transition", messageKey, from, to });
  }
  static idempotencyKeyMismatch() {
    return new APIError({ status: 409, error: "idempotency_key_mismatch", messageKey: "common.idempotency_mismatch" });
  }
  static badRequest(messageKey = "common.bad_request") {
    return new APIError({ status: 400, error: "bad_request", messageKey });
  }
  static rateLimited(messageKey = "common.rate_limited") {
    return new APIError({ status: 429, error: "rate_limited", messageKey });
  }
  /** 410 — a resource that existed is gone (e.g. a lapsed reservation lease). Re-acquire, don't retry. */
  static gone(messageKey = "common.gone") {
    return new APIError({ status: 410, error: "gone", messageKey });
  }
  static internal(messageKey = "common.internal") {
    return new APIError({ status: 500, error: "internal", messageKey });
  }
}

function defaultErrorCode(status: number): string {
  switch (status) {
    case 400: return "bad_request";
    case 401: return "unauthorized";
    case 403: return "forbidden";
    case 404: return "not_found";
    case 409: return "conflict";
    case 410: return "gone";
    case 422: return "validation";
    case 429: return "rate_limited";
    default: return "internal";
  }
}
