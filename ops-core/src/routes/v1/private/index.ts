import { Router } from "express";
import { requireAuth } from "../../../middlewares/auth.middleware";
import spacesRoutes from "../../../modules/spaces/routes";

const router = Router();

// Every route here requires an authenticated staff member (VIEWER+).
// requireAuth populates req.actor (F01-T04 lands the real session resolution).
router.use(requireAuth);

router.use("/spaces", spacesRoutes);
// F02–F10 mount their routers here: assets, requests, reservations, quotes,
// tasks, conflicts, audit, approvals.

export default router;
