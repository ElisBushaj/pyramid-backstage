import { body, query, type ValidationChain } from "express-validator";
import { ValidationHelpers } from "../../utils/validation.utils";

const EVENT_TYPES = ["CONFERENCE", "EXHIBITION", "WORKSHOP", "PERFORMANCE", "COMMUNITY", "PRIVATE", "OTHER"];
const LAYOUTS = ["THEATER", "CLASSROOM", "BANQUET", "RECEPTION", "CABARET", "BOARDROOM", "CUSTOM"];
const STATUSES = ["DRAFT", "PROPOSED", "APPROVED", "SCHEDULED", "COMPLETED", "REJECTED"];

const preferredDatesRule = (chain: ValidationChain, optional: boolean) => {
  const c = optional ? chain.optional() : chain;
  return c.isArray({ min: 1 }).withMessage("validation.array").bail().custom((arr: unknown) => {
    for (const d of arr as Array<{ start?: unknown; end?: unknown }>) {
      if (!d || typeof d.start !== "string" || typeof d.end !== "string") throw new Error("validation.datetime");
      const s = Date.parse(d.start);
      const e = Date.parse(d.end);
      if (Number.isNaN(s) || Number.isNaN(e)) throw new Error("validation.datetime");
      if (s >= e) throw new Error("validation.range");
    }
    return true;
  });
};

export const listRequestsValidators: ValidationChain[] = [
  ValidationHelpers.optionalEnumOf("status", STATUSES, "query"),
  query("q").optional().isString().isLength({ max: 80 }).withMessage("validation.length"),
  ValidationHelpers.optionalIntMin("page", 1, "query"),
  ValidationHelpers.optionalIntMin("pageSize", 1, "query"),
];

export const createRequestValidators: ValidationChain[] = [
  ValidationHelpers.requiredString("title", "body", 160),
  ValidationHelpers.requiredString("organizerName", "body", 160),
  ValidationHelpers.optionalEmail("contactEmail"),
  ValidationHelpers.optionalString("contactPhone", "body", 40),
  ValidationHelpers.intMin("expectedAttendees", 1),
  ValidationHelpers.enumOf("eventType", EVENT_TYPES),
  preferredDatesRule(body("preferredDates"), false),
  body("requirements").optional().isObject().withMessage("validation.object"),
  body("requirements.layout").optional().isIn(LAYOUTS).withMessage("validation.enum"),
];

export const updateRequestValidators: ValidationChain[] = [
  body("title").optional().isString().bail().isLength({ min: 1, max: 160 }).withMessage("validation.length"),
  body("organizerName").optional().isString().bail().isLength({ min: 1, max: 160 }).withMessage("validation.length"),
  ValidationHelpers.optionalEmail("contactEmail"),
  ValidationHelpers.optionalString("contactPhone", "body", 40),
  ValidationHelpers.optionalIntMin("expectedAttendees", 1),
  ValidationHelpers.optionalEnumOf("eventType", EVENT_TYPES),
  preferredDatesRule(body("preferredDates"), true),
  body("requirements").optional().isObject().withMessage("validation.object"),
  body("requirements.layout").optional().isIn(LAYOUTS).withMessage("validation.enum"),
];
