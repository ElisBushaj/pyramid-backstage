import { body, query, type ValidationChain } from "express-validator";

export const listSpacesValidators: ValidationChain[] = [
  query("minCapacity").optional().isInt({ min: 1 }).withMessage("validation.min").toInt(),
  query("start").optional().isISO8601().withMessage("validation.datetime"),
  query("end").optional().isISO8601().withMessage("validation.datetime"),
];

export const createSpaceValidators: ValidationChain[] = [
  body("name").isString().notEmpty().withMessage("validation.required"),
  body("floor").isInt().withMessage("validation.int"),
  body("capacities").isObject().withMessage("validation.object"),
  body("dayRateMinor").isInt({ min: 0 }).withMessage("validation.min"),
  body("setupBufferMinutes").optional().isInt({ min: 0 }),
  body("teardownBufferMinutes").optional().isInt({ min: 0 }),
];
