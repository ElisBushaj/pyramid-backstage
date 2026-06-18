import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { auditService } from "./service";

export class AuditController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return auditService.list({
      requestId: req.query.requestId as string | undefined,
      entityType: req.query.entityType as string | undefined,
    });
  }
}
