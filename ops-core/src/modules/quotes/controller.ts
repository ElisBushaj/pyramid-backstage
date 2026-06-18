import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { quotesService } from "./service";

export class QuotesController {
  @controlledResponse("post")
  static async generate(req: Request, _res: Response) {
    return quotesService.generate(req.actor!, {
      requestId: req.body.requestId,
      reservationId: req.body.reservationId,
      extraLineItems: req.body.extraLineItems,
    });
  }
}
