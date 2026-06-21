import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { reservationsService } from "./service";

export class ReservationsController {
  @controlledResponse("get")
  static async schedule(req: Request, _res: Response) {
    return reservationsService.schedule({
      start: new Date(req.query.start as string),
      end: new Date(req.query.end as string),
      spaceId: req.query.spaceId as string | undefined,
      status: req.query.status as "HELD" | "CONFIRMED" | undefined,
    });
  }

  @controlledResponse("post")
  static async hold(req: Request, _res: Response) {
    return reservationsService.hold(req.actor!, req.body);
  }

  @controlledResponse("post", 200)
  static async confirm(req: Request, _res: Response) {
    return reservationsService.confirm(req.actor!, req.params.id as string);
  }

  @controlledResponse("post", 200)
  static async release(req: Request, _res: Response) {
    return reservationsService.release(req.actor!, req.params.id as string);
  }
}
