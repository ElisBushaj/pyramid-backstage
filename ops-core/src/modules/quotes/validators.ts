import { body, type ValidationChain } from "express-validator";

export const createQuoteValidators: ValidationChain[] = [
  body("requestId").isUUID().withMessage("validation.uuid"),
  body("reservationId").optional().isUUID().withMessage("validation.uuid"),
  body("extraLineItems").optional().isArray().withMessage("validation.array"),
  body("extraLineItems.*.label").isString().withMessage("validation.required").bail().notEmpty().withMessage("validation.required"),
  body("extraLineItems.*.qty").isInt({ min: 1 }).withMessage("validation.min"),
  body("extraLineItems.*.unitPriceMinor").isInt({ min: 0 }).withMessage("validation.min"),
];
