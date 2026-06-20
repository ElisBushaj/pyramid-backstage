import { query, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

export const checkConflictsValidators: ValidationChain[] = [
  query("spaceId").optional().isString().withMessage("validation.invalid"),
  ValidationHelpers.isoDate("start", "query", true),
  ValidationHelpers.isoDate("end", "query", true),
  query("end").custom((end, { req }) => {
    const start = (req.query as Record<string, unknown> | undefined)?.start;
    if (start && end && Date.parse(String(start)) >= Date.parse(String(end))) throw new Error("validation.range");
    return true;
  }),
];
