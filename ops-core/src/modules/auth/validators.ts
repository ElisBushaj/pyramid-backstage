import { body, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

export const loginValidators: ValidationChain[] = [
  ValidationHelpers.email("email"),
  body("password").isString().withMessage("validation.invalid").bail().isLength({ min: 8 }).withMessage("validation.length"),
];
