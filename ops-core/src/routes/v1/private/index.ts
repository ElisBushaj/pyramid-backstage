import { Router } from "express";
import { requireAuth } from "../../../middlewares/auth.middleware";
import { requireCsrf } from "../../../middlewares/csrf.middleware";
import authRoutes from "../../../modules/auth/routes";
import spacesRoutes from "../../../modules/spaces/routes";
import assetsRoutes from "../../../modules/assets/routes";
import requestsRoutes from "../../../modules/requests/routes";
import reservationsRoutes from "../../../modules/reservations/routes";
import quotesRoutes from "../../../modules/quotes/routes";
import { requestTaskRoutes, taskRoutes } from "../../../modules/tasks/routes";
import conflictsRoutes from "../../../modules/conflicts/routes";
import auditRoutes from "../../../modules/audit/routes";

const router = Router();

// Every route here requires an authenticated staff member (VIEWER+).
// requireAuth resolves the pb_session cookie → req.actor (F01-T04);
// requireCsrf rejects state-changing requests without a valid CSRF token (F01-T06).
router.use(requireAuth);
router.use(requireCsrf);

router.use("/auth", authRoutes);
router.use("/spaces", spacesRoutes);
router.use("/assets", assetsRoutes);
router.use("/requests", requestsRoutes);
router.use("/requests", requestTaskRoutes); // /requests/:id/tasks
router.use("/tasks", taskRoutes); // PATCH /tasks/:id
router.use("/reservations", reservationsRoutes);
router.use("/quotes", quotesRoutes);
router.use("/conflicts", conflictsRoutes);
router.use("/audit", auditRoutes);
// F02–F10 mount their routers here as built: assets, requests, reservations,
// quotes, tasks, conflicts, approvals, dashboard.

export default router;
