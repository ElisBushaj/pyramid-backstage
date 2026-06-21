import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { usersService } from "./service";

export class UsersController {
  @controlledResponse("get")
  static async list(req: Request, _res: Response) {
    return usersService.list({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
  }

  @controlledResponse("post")
  static async create(req: Request, _res: Response) {
    return usersService.create(req.actor!, req.body);
  }

  @controlledResponse("patch")
  static async update(req: Request, _res: Response) {
    return usersService.update(req.actor!, req.params.id as string, req.body);
  }
}
