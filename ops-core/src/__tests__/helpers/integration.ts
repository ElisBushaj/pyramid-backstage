import { randomUUID } from "node:crypto";
import request from "supertest";
import type { Test } from "supertest";
import { createApp } from "../../config/express";
import { prisma } from "../../config/prisma";
import { hashPassword } from "../../utils/password";
import type { Role } from "../../types/api/auth";

export const app = createApp();
export { prisma };

/** Truncate all domain tables (keep the migration table) for a clean test slate. */
export async function resetDb(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!rows.length) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

const PW = "password123";

export async function makeUser(role: Role, overrides: Partial<{ email: string; name: string; isActive: boolean }> = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}@pyramid.test`,
      name: overrides.name ?? `${role} User`,
      passwordHash: await hashPassword(PW),
      role,
      isActive: overrides.isActive ?? true,
    },
  });
}

function cookieValue(setCookie: string[] | string | undefined, name: string): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of arr) {
    const m = c.match(new RegExp(`${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]!);
  }
  return "";
}

/** An authenticated supertest client that auto-attaches CSRF + an Idempotency-Key. */
export class Client {
  constructor(
    private agent: ReturnType<typeof request.agent>,
    public csrf: string,
    public user: { id: string; email: string; name: string; role: Role },
  ) {}
  get(url: string): Test {
    return this.agent.get(url).set("x-csrf-token", this.csrf);
  }
  post(url: string, idem = randomUUID()): Test {
    return this.agent.post(url).set("x-csrf-token", this.csrf).set("Idempotency-Key", idem);
  }
  patch(url: string, idem = randomUUID()): Test {
    return this.agent.patch(url).set("x-csrf-token", this.csrf).set("Idempotency-Key", idem);
  }
}

/** Seed a user of `role` and log in; returns an authed Client. */
export async function loginAs(role: Role): Promise<Client> {
  const user = await makeUser(role);
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/public/auth/login").send({ email: user.email, password: PW });
  if (res.status !== 200) throw new Error(`login failed for ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = cookieValue(res.headers["set-cookie"], "pb_csrf");
  return new Client(agent, csrf, { id: user.id, email: user.email, name: user.name, role });
}

/** A bare unauthenticated supertest request against the app. */
export function anon() {
  return request(app);
}
