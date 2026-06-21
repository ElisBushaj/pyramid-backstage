import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { auditService } from "./service";

export class AuditController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return auditService.list({
      requestId: req.query.requestId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      order: req.query.order === "desc" ? "desc" : undefined,
    });
  }
}
