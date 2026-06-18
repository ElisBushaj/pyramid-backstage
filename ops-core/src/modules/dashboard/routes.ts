import { Router } from "express";
import { DashboardController } from "./controller";

const router = Router();

router.get("/stats", DashboardController.stats);

export default router;
