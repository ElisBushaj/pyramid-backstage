import { Router } from "express";
import { requireAuth, requireRole } from "../../../middlewares/auth.middleware";

const router = Router();

// Admin tier: authenticated + ADMIN role. F01-T07 mounts /users here.
router.use(requireAuth, requireRole("ADMIN"));
// router.use("/users", adminUsersRoutes);

export default router;
