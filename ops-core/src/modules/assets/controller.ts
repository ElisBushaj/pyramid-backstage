import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { assetsService } from "./service";

export class AssetsController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return assetsService.list({
      type: req.query.type as string | undefined,
      quantity: req.query.quantity ? Number(req.query.quantity) : undefined,
      start: req.query.start as string | undefined,
      end: req.query.end as string | undefined,
    });
  }

  @controlledResponse("post")
  static async create(req: Request, _res: Response) {
    return assetsService.create(req.actor!, req.body);
  }

  @controlledResponse("patch")
  static async update(req: Request, _res: Response) {
    return assetsService.update(req.actor!, req.params.id as string, req.body);
  }
}
