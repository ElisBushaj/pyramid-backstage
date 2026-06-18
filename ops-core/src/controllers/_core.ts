import type { NextFunction, Request, Response } from "express";
import { APIError } from "../errors";
import type { ServiceResponse } from "../types";
import { translate, type Locale } from "../utils/i18n";

type HttpVerb = "get" | "post" | "patch" | "delete";
const statusFor: Record<HttpVerb, number> = { get: 200, post: 201, patch: 200, delete: 200 };

/**
 * Decorator for controller methods. The method returns a ServiceResponse<T>
 * (or raw data); this layer localizes the message, sets the status, and maps
 * any thrown APIError onto the error contract. Controllers never touch `res`.
 */
export function controlledResponse(verb: HttpVerb): MethodDecorator {
  return (_t, _k, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
      try {
        const result = await original.call(this, req, res);
        if (res.headersSent) return;
        const locale: Locale = req.locale ?? "en";
        if (result && typeof result === "object" && "messageKey" in result) {
          const r = result as ServiceResponse<unknown>;
          res.status(statusFor[verb]).json({ ...r, message: r.message || translate(r.messageKey, locale) });
        } else {
          res.status(statusFor[verb]).json(result);
        }
      } catch (err) {
        formatError(err, req, res, next);
      }
    };
    return descriptor;
  };
}

/** Maps an APIError (or anything) to the error-contract body. Also the global fallback. */
export function formatError(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  const locale: Locale = req.locale ?? "en";
  if (err instanceof APIError) {
    res.status(err.status).json({
      status: err.status,
      error: err.error,
      messageKey: err.messageKey,
      message: translate(err.messageKey, locale, err.messageParams),
      ...(err.conflicts ? { conflicts: err.conflicts } : {}),
      ...(err.from ? { from: err.from, to: err.to } : {}),
      ...(err.fields ? { fields: err.fields } : {}),
    });
    return;
  }
  // eslint-disable-next-line no-console
  console.error("[unhandled]", err);
  res.status(500).json({ status: 500, error: "internal", messageKey: "common.internal", message: "Internal Server Error" });
}
