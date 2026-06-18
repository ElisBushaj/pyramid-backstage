import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { approvalsService } from "./service";

export class ApprovalsController {
  @controlledResponse("post", 200)
  static async approve(req: Request, _res: Response) {
    return approvalsService.approve(req.actor!, req.params.id as string);
  }

  @controlledResponse("post", 200)
  static async reject(req: Request, _res: Response) {
    return approvalsService.reject(req.actor!, req.params.id as string, req.body.reason);
  }
}
