import { Router } from "express";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { UsersController } from "./controller";
import { createUserValidators, updateUserValidators, listUsersValidators } from "./validators";

// Mounted under /admin/users — the admin tier already enforces auth + ADMIN role.
const router = Router();

router.get("/", listUsersValidators, handleValidation, UsersController.list);
router.post("/", withIdempotency(), createUserValidators, handleValidation, UsersController.create);
router.patch("/:id", updateUserValidators, handleValidation, UsersController.update);

export default router;
