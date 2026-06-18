import { Router } from "express";
import { requireAuth, requireRole } from "../../../middlewares/auth.middleware";
import { requireCsrf } from "../../../middlewares/csrf.middleware";
import usersRoutes from "../../../modules/users/routes";

const router = Router();

// Admin tier: authenticated + ADMIN role + CSRF on mutations.
router.use(requireAuth, requireRole("ADMIN"), requireCsrf);

router.use("/users", usersRoutes);

export default router;
