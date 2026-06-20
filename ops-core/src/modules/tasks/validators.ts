import { body, type ValidationChain } from "express-validator";

const PHASES = ["SETUP", "TEARDOWN"];
const STATUSES = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED"];

export const persistTasksValidators: ValidationChain[] = [
  body("tasks").isArray({ min: 1 }).withMessage("validation.array"),
  body("tasks.*.title").isString().notEmpty().withMessage("validation.required"),
  body("tasks.*.phase").isIn(PHASES).withMessage("validation.enum"),
  body("tasks.*.owner").optional().isString().withMessage("validation.invalid"),
  body("tasks.*.assigneeId").optional().isUUID().withMessage("validation.uuid"),
  body("tasks.*.dueOffsetHours").optional().isInt().withMessage("validation.int"),
];

export const updateTaskValidators: ValidationChain[] = [
  body("status").optional().isIn(STATUSES).withMessage("validation.enum"),
  body("assigneeId").optional({ values: "null" }).isUUID().withMessage("validation.uuid"),
];
