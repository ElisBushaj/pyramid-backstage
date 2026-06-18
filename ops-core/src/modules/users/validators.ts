import { body, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

const ROLES = ["ADMIN", "MANAGER", "OPS", "VIEWER"] as const;

export const createUserValidators: ValidationChain[] = [
  ValidationHelpers.email("email"),
  ValidationHelpers.requiredString("name", "body", 120),
  body("password").isString().withMessage("validation.invalid").bail().isLength({ min: 8 }).withMessage("validation.length"),
  ValidationHelpers.optionalEnumOf("role", ROLES),
  ValidationHelpers.boolean("isActive"),
];

export const updateUserValidators: ValidationChain[] = [
  ValidationHelpers.optionalEnumOf("role", ROLES),
  ValidationHelpers.boolean("isActive"),
  body("name").optional().isString().withMessage("validation.invalid").bail().isLength({ min: 1, max: 120 }).withMessage("validation.length"),
  body("password").optional().isString().isLength({ min: 8 }).withMessage("validation.length"),
];
