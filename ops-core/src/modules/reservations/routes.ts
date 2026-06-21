import { Router } from "express";
import { requireRole } from "../../middlewares/auth.middleware";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { ReservationsController } from "./controller";
import { createReservationValidators, scheduleQueryValidators } from "./validators";

const router = Router();

// Read-only schedule (ADR-0016): VIEWER+ may see the timeline, so it is declared
// BEFORE the OPS gate below. PARTNER never reaches here (the parent /reservations
// mount is requireRole("VIEWER"), and PARTNER ranks below VIEWER → 403).
router.get("/", scheduleQueryValidators, handleValidation, ReservationsController.schedule);

// Inventory writes require OPS+ (SECURITY.md / CONTRACT.md): a VIEWER is read-only.
router.use(requireRole("OPS"));

router.post("/", withIdempotency(), createReservationValidators, handleValidation, ReservationsController.hold);
router.post("/:id/confirm", withIdempotency(), ReservationsController.confirm);
router.post("/:id/release", withIdempotency(), ReservationsController.release);

export default router;
