import type { Request, Response } from "express";
import { controlledResponse } from "../../controllers/_core";
import { usersService } from "./service";

export class UsersController {
  @controlledResponse("get")
  static async list(_req: Request, _res: Response) {
    return usersService.list();
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
