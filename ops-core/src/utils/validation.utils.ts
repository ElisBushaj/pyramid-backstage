import type { NextFunction, Request, Response } from "express";
import { body, param, query, validationResult, type ValidationChain } from "express-validator";
import { APIError } from "../errors";

type Loc = "body" | "query" | "param";
const field = (loc: Loc, name: string): ValidationChain =>
  loc === "body" ? body(name) : loc === "query" ? query(name) : param(name);

/**
 * Reusable validation chains built on express-validator (no Zod, per
 * CORE_PATTERNS). Every `.withMessage` is a registered `messageKey` so a failure
 * renders the 422 `fields` body localized. New shared rules go here.
 */
export const ValidationHelpers = {
  uuidParam(name: string): ValidationChain {
    return param(name).isUUID().withMessage("validation.uuid");
  },
  requiredString(name: string, loc: Loc = "body", max = 500): ValidationChain {
    return field(loc, name).isString().withMessage("validation.invalid").bail().trim().notEmpty().withMessage("validation.required").isLength({ max }).withMessage("validation.length");
  },
  optionalString(name: string, loc: Loc = "body", max = 1000): ValidationChain {
    return field(loc, name).optional({ values: "null" }).isString().withMessage("validation.invalid").isLength({ max }).withMessage("validation.length");
  },
  intMin(name: string, min: number, loc: Loc = "body"): ValidationChain {
    return field(loc, name).isInt({ min }).withMessage("validation.min").toInt();
  },
  intRange(name: string, min: number, max: number, loc: Loc = "body"): ValidationChain {
    return field(loc, name).isInt({ min, max }).withMessage("validation.invalid").toInt();
  },
  optionalIntMin(name: string, min: number, loc: Loc = "body"): ValidationChain {
    return field(loc, name).optional().isInt({ min }).withMessage("validation.min").toInt();
  },
  email(name: string, loc: Loc = "body"): ValidationChain {
    return field(loc, name).isEmail().withMessage("validation.email").normalizeEmail();
  },
  optionalEmail(name: string, loc: Loc = "body"): ValidationChain {
    return field(loc, name).optional({ values: "null" }).isEmail().withMessage("validation.email");
  },
  enumOf(name: string, values: readonly string[], loc: Loc = "body"): ValidationChain {
    return field(loc, name).isString().bail().isIn(values as string[]).withMessage("validation.enum");
  },
  optionalEnumOf(name: string, values: readonly string[], loc: Loc = "body"): ValidationChain {
    return field(loc, name).optional().isIn(values as string[]).withMessage("validation.enum");
  },
  isoDate(name: string, loc: Loc = "query", required = false): ValidationChain {
    const c = field(loc, name);
    return (required ? c : c.optional()).isISO8601().withMessage("validation.datetime");
  },
  arrayMin(name: string, min: number, loc: Loc = "body"): ValidationChain {
    return field(loc, name).isArray({ min }).withMessage("validation.array");
  },
  object(name: string, loc: Loc = "body", optional = false): ValidationChain {
    const c = field(loc, name);
    return (optional ? c.optional({ values: "null" }) : c).isObject().withMessage("validation.object");
  },
  boolean(name: string, loc: Loc = "body"): ValidationChain {
    return field(loc, name).optional().isBoolean().withMessage("validation.invalid").toBoolean();
  },
};

/**
 * Terminal middleware for a validator chain: collects express-validator errors
 * into the `422 validation { fields }` contract body. Mount after the chains.
 */
export function handleValidation(req: Request, _res: Response, next: NextFunction): void {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const fields: Record<string, string> = {};
  for (const e of result.array()) {
    const path = (e as { path?: string }).path ?? "_";
    if (!fields[path]) fields[path] = String(e.msg);
  }
  next(APIError.validation(fields));
}
