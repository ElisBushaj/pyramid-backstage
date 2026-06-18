import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { conflictsService } from "./service";

export class ConflictsController {
  @controlledResponse("get")
  static async check(req: Request, _res: Response) {
    return conflictsService.check({
      spaceId: req.query.spaceId as string | undefined,
      start: req.query.start as string,
      end: req.query.end as string,
    });
  }
}
