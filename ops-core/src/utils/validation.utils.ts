import type { NextFunction, Request, Response } from "express";
import { param, validationResult, type ValidationChain } from "express-validator";
import { APIError } from "../errors";

/** Reusable validation chains. New custom validators go here (per CORE_PATTERNS). */
export const ValidationHelpers = {
  uuidParam(name: string): ValidationChain {
    return param(name).isUUID().withMessage("validation.invalid");
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
    // express-validator v7 FieldValidationError
    const path = (e as { path?: string }).path ?? "_";
    fields[path] = String(e.msg);
  }
  next(APIError.validation(fields));
}
