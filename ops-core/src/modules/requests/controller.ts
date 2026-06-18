import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { requestsService } from "./service";

export class RequestsController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return requestsService.list({
      status: req.query.status as string | undefined,
      q: req.query.q as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
  }

  @controlledResponse("post")
  static async create(req: Request, _res: Response) {
    return requestsService.create(req.actor!, req.body);
  }

  @controlledResponse("get")
  static async getAggregate(req: Request, _res: Response) {
    return requestsService.getAggregate(req.params.id as string);
  }

  @controlledResponse("patch")
  static async update(req: Request, _res: Response) {
    return requestsService.updateDraft(req.actor!, req.params.id as string, req.body);
  }
}
