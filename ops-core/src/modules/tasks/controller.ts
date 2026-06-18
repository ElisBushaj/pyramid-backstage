import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { tasksService } from "./service";

export class TasksController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return tasksService.list(req.params.id as string);
  }

  @controlledResponse("post")
  static async persist(req: Request, _res: Response) {
    return tasksService.persist(req.actor!, req.params.id as string, req.body.tasks);
  }

  @controlledResponse("patch")
  static async update(req: Request, _res: Response) {
    return tasksService.update(req.actor!, req.params.id as string, { assigneeId: req.body.assigneeId, status: req.body.status });
  }
}
