import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse, type Actor } from "../../types";
import type { User, UserInput } from "../../types/api/auth";
import { hashPassword } from "../../utils/password";
import { writeAudit } from "../audit/audit.writer";
import { userToDto } from "../auth/service";

class UsersService {
  async list(): Promise<ServiceResponse<User[]>> {
    const rows = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
    return ok(rows.map(userToDto), "user.list.success");
  }

  async create(actor: Actor, input: UserInput): Promise<ServiceResponse<User>> {
    const email = input.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw APIError.validation({ email: "user.email_taken" });
    }
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { email, name: input.name, passwordHash, role: input.role ?? "VIEWER", isActive: input.isActive ?? true },
        });
        await writeAudit(tx, {
          actor, action: "user.create", entityType: "User", entityId: u.id,
          after: { email: u.email, name: u.name, role: u.role, isActive: u.isActive },
        });
        return u;
      });
      return ok(userToDto(user), "user.created");
    } catch (e) {
      // Lost the email-uniqueness race → map the unique violation to the 422 contract.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw APIError.validation({ email: "user.email_taken" });
      }
      throw e;
    }
  }

  async update(actor: Actor, id: string, input: Partial<UserInput>): Promise<ServiceResponse<User>> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw APIError.notFound();

    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.role !== undefined) data.role = input.role;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.password) data.passwordHash = await hashPassword(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data });
      await writeAudit(tx, {
        actor, action: "user.update", entityType: "User", entityId: id,
        before: { role: existing.role, isActive: existing.isActive, name: existing.name },
        after: { role: u.role, isActive: u.isActive, name: u.name },
      });
      return u;
    });
    return ok(userToDto(user), "user.updated");
  }
}

export const usersService = new UsersService();
