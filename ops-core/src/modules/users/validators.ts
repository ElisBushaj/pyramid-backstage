import { body, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

// Full role ladder incl. PARTNER (F15 / ADR-0010). Mirrors Role in types/api/auth.ts;
// omitting PARTNER here made it un-creatable/un-assignable via /admin/users.
const ROLES = ["ADMIN", "MANAGER", "OPS", "VIEWER", "PARTNER"] as const;

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
