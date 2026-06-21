import { query, type ValidationChain } from "express-validator";

export const listAuditValidators: ValidationChain[] = [
  query("requestId").optional().isString().withMessage("validation.invalid"),
  query("entityType").optional().isString().withMessage("validation.invalid"),
  query("page").optional().isInt({ min: 1 }).withMessage("validation.int"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("validation.int"),
  query("order").optional().isIn(["asc", "desc"]).withMessage("validation.enum"),
];
