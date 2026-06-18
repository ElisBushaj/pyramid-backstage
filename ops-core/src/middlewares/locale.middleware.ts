import type { NextFunction, Request, Response } from "express";
import type { Locale } from "../utils/i18n";

/** Resolves the active locale from Accept-Language (al|en), defaulting to en. */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = (req.headers["accept-language"] ?? "").toString().toLowerCase();
  const locale: Locale = header.startsWith("al") || header.startsWith("sq") ? "al" : "en";
  req.locale = locale;
  next();
}
