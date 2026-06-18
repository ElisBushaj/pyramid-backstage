import { query, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

export const checkConflictsValidators: ValidationChain[] = [
  query("spaceId").optional().isString().withMessage("validation.invalid"),
  ValidationHelpers.isoDate("start", "query", true),
  ValidationHelpers.isoDate("end", "query", true),
];
