import { Router } from "express";
import { body } from "express-validator";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { ApprovalsController } from "./controller";

const rejectValidators = [
  body("reason").isString().withMessage("validation.invalid").bail().isLength({ min: 3, max: 500 }).withMessage("validation.length"),
];

// Mounted under /requests → /requests/:id/approve, /requests/:id/reject (MANAGER+).
const router = Router();

router.post("/:id/approve", requireRole("MANAGER"), withIdempotency(), ApprovalsController.approve);
router.post("/:id/reject", requireRole("MANAGER"), withIdempotency(), rejectValidators, handleValidation, ApprovalsController.reject);

export default router;
