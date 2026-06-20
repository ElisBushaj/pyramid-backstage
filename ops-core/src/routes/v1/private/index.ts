import { Router } from "express";
import { requireAuth, requireRole } from "../../../middlewares/auth.middleware";
import { requireCsrf } from "../../../middlewares/csrf.middleware";
import authRoutes from "../../../modules/auth/routes";
import spacesRoutes from "../../../modules/spaces/routes";
import assetsRoutes from "../../../modules/assets/routes";
import requestsRoutes from "../../../modules/requests/routes";
import reservationsRoutes from "../../../modules/reservations/routes";
import quotesRoutes from "../../../modules/quotes/routes";
import { requestTaskRoutes, taskRoutes } from "../../../modules/tasks/routes";
import approvalsRoutes from "../../../modules/approvals/routes";
import conflictsRoutes from "../../../modules/conflicts/routes";
import auditRoutes from "../../../modules/audit/routes";
import dashboardRoutes from "../../../modules/dashboard/routes";

const router = Router();

// Every route here requires an authenticated staff member (VIEWER+).
// requireAuth resolves the pb_session cookie → req.actor (F01-T04);
// requireCsrf rejects state-changing requests without a valid CSRF token (F01-T06).
router.use(requireAuth);
router.use(requireCsrf);

// PARTNER-reachable (F15): /auth/me + own-scoped requests (create + read own). The
// requests service row-scopes every read/write by createdById when actor.role === PARTNER.
router.use("/auth", authRoutes);
router.use("/requests", requestsRoutes);

// The staff tool surface — VIEWER+ only. PARTNER (rank −1) gets 403 here (ADR-0010).
const staff = requireRole("VIEWER");
router.use("/spaces", staff, spacesRoutes);
router.use("/assets", staff, assetsRoutes);
router.use("/requests", staff, requestTaskRoutes); // /requests/:id/tasks (staff)
router.use("/requests", staff, approvalsRoutes); // /requests/:id/approve, /reject (MANAGER+)
router.use("/tasks", staff, taskRoutes); // PATCH /tasks/:id
router.use("/reservations", staff, reservationsRoutes);
router.use("/quotes", staff, quotesRoutes);
router.use("/conflicts", staff, conflictsRoutes);
router.use("/audit", staff, auditRoutes);
router.use("/dashboard", staff, dashboardRoutes);
// F02–F10 mount their routers here as built: assets, requests, reservations,
// quotes, tasks, conflicts, approvals, dashboard.

export default router;
