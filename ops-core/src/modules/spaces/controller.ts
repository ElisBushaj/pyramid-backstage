import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { spacesService } from "./service";

/**
 * Spaces endpoints — the worked example of the module pattern (CORE_PATTERNS).
 * Controllers are thin: parse req, pull req.actor, call the service, return its
 * ServiceResponse. Status + envelope + error mapping are handled by the decorator.
 */
export class SpacesController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return spacesService.match({
      minCapacity: req.query.minCapacity ? Number(req.query.minCapacity) : undefined,
      layout: req.query.layout as string | undefined,
      start: req.query.start as string | undefined,
      end: req.query.end as string | undefined,
    });
  }

  @controlledResponse("get")
  static async availability(req: Request, _res: Response) {
    return spacesService.availabilityFor(req.params.id as string, req.query.start as string, req.query.end as string);
  }

  @controlledResponse("post")
  static async create(req: Request, _res: Response) {
    return spacesService.create(req.actor!, req.body);
  }

  @controlledResponse("patch")
  static async update(req: Request, _res: Response) {
    return spacesService.update(req.actor!, req.params.id as string, req.body);
  }
}
