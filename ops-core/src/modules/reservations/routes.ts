import { Router } from "express";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { ReservationsController } from "./controller";
import { createReservationValidators } from "./validators";

const router = Router();

router.post("/", withIdempotency(), createReservationValidators, handleValidation, ReservationsController.hold);
router.post("/:id/confirm", withIdempotency(), ReservationsController.confirm);
router.post("/:id/release", withIdempotency(), ReservationsController.release);

export default router;
