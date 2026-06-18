import { prisma } from "../../config/prisma";
import { APIError } from "../../errors";
import { ok, type ServiceResponse } from "../../types";
import type { User } from "../../types/api/auth";
import { hashPassword, verifyPassword } from "../../utils/password";
import { createSession, type IssuedSession } from "./session";

export function userToDto(u: {
  id: string; email: string; name: string; role: string; isActive: boolean; createdAt?: Date;
}): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as User["role"],
    isActive: u.isActive,
    ...(u.createdAt ? { createdAt: u.createdAt.toISOString() } : {}),
  };
}

// A constant argon2id hash to verify against when the email is unknown, so the
// unknown-email and wrong-password paths take the same time (no user enumeration).
let dummyHash: string | null = null;
async function dummy(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword("pyramid-backstage-non-account-placeholder");
  return dummyHash;
}

class AuthService {
  /** Verify credentials (no enumeration) and open a server-side session. */
  async login(email: string, password: string): Promise<{ user: User; session: IssuedSession }> {
    const user = await prisma.user.findUnique({ where: { email } });
    const hash = user?.passwordHash ?? (await dummy());
    const passwordOk = await verifyPassword(hash, password);
    if (!user || !user.isActive || !passwordOk) {
      throw new APIError({ status: 401, error: "unauthorized", messageKey: "auth.login.invalid" });
    }
    const session = await createSession(user.id);
    return { user: userToDto(user), session };
  }

  async me(actorId: string): Promise<ServiceResponse<User>> {
    const user = await prisma.user.findUnique({ where: { id: actorId } });
    if (!user) throw APIError.unauthorized();
    return ok(userToDto(user), "auth.me.success");
  }
}

export const authService = new AuthService();
