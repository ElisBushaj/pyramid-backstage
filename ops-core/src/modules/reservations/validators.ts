import { body, type ValidationChain } from "express-validator";

export const createReservationValidators: ValidationChain[] = [
  body("requestId").isUUID().withMessage("validation.uuid"),
  body("spaceId").isUUID().withMessage("validation.uuid"),
  body("dateRange").isObject().withMessage("validation.object"),
  body("dateRange.start").isISO8601().withMessage("validation.datetime"),
  body("dateRange.end").isISO8601().withMessage("validation.datetime"),
  body("dateRange").custom((dr: { start?: string; end?: string }) => {
    if (!dr || Date.parse(dr.start ?? "") >= Date.parse(dr.end ?? "")) throw new Error("validation.range");
    return true;
  }),
  body("assets").optional().isArray().withMessage("validation.array"),
  body("assets.*.assetId").isUUID().withMessage("validation.uuid"),
  body("assets.*.quantity").isInt({ min: 1 }).withMessage("validation.min"),
  body("holdMinutes").optional().isInt({ min: 1 }).withMessage("validation.min"),
];
