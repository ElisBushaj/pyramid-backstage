import { body, query, type ValidationChain } from "express-validator";

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

/** GET /private/reservations?start&end[&spaceId][&status] — the schedule read (ADR-0016). */
export const scheduleQueryValidators: ValidationChain[] = [
  query("start").isISO8601().withMessage("validation.datetime"),
  query("end").isISO8601().withMessage("validation.datetime"),
  query("end").custom((end: string, { req }) => {
    if (Date.parse((req.query as { start?: string }).start ?? "") >= Date.parse(end ?? "")) throw new Error("validation.range");
    return true;
  }),
  query("spaceId").optional().isUUID().withMessage("validation.uuid"),
  query("status").optional().isIn(["HELD", "CONFIRMED"]).withMessage("validation.enum"),
];
