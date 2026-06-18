import { Router } from "express";
import { withIdempotency } from "../../middlewares/idempotency.middleware";
import { handleValidation } from "../../utils/validation.utils";
import { TasksController } from "./controller";
import { persistTasksValidators, updateTaskValidators } from "./validators";

/** Request-scoped task routes — mounted under /requests (→ /requests/:id/tasks). */
export const requestTaskRoutes = Router();
requestTaskRoutes.get("/:id/tasks", TasksController.list);
requestTaskRoutes.post("/:id/tasks", withIdempotency(), persistTasksValidators, handleValidation, TasksController.persist);

/** Task-scoped routes — mounted under /tasks (→ /tasks/:id). */
export const taskRoutes = Router();
taskRoutes.patch("/:id", withIdempotency(), updateTaskValidators, handleValidation, TasksController.update);
