import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { ReservationsController } from "./controller";
import { createReservationValidators } from "./validators";

const router = Router();

// Inventory writes require OPS+ (SECURITY.md / CONTRACT.md): a VIEWER is read-only.
router.use(requireRole("OPS"));

router.post("/", withIdempotency(), createReservationValidators, handleValidation, ReservationsController.hold);
router.post("/:id/confirm", withIdempotency(), ReservationsController.confirm);
router.post("/:id/release", withIdempotency(), ReservationsController.release);

export default router;
