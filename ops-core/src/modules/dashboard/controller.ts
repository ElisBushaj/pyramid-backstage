import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { dashboardService } from "./service";

export class DashboardController {
  @controlledResponse("get")
  static async stats(_req: Request, _res: Response) {
    return dashboardService.stats();
  }
}
