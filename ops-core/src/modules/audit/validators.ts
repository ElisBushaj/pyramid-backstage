import { query, type ValidationChain } from "express-validator";

export const listAuditValidators: ValidationChain[] = [
  query("requestId").optional().isString().withMessage("validation.invalid"),
  query("entityType").optional().isString().withMessage("validation.invalid"),
];
