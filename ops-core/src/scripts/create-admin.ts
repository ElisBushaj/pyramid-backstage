/**
 * Create the first ADMIN staff user.
 *   pnpm create:admin -- <email> <name> <password> [--force]
 * Refuses to run against NODE_ENV=production without --force. Re-running with an
 * existing email fails clearly rather than duplicating. (F01-T02)
 */
import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { vars } from "../config/vars";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");
  const [email, name, password] = args;

  if (!email || !name || !password) {
    console.error("usage: create:admin -- <email> <name> <password> [--force]");
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("password must be at least 8 characters");
    process.exit(2);
  }
  if (vars.isProd && !force) {
    console.error("refusing to run against NODE_ENV=production without --force");
    process.exit(2);
  }

  const normEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) {
    console.error(`a user with email ${normEmail} already exists (id ${existing.id})`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: { email: normEmail, name, passwordHash: await hashPassword(password), role: "ADMIN", isActive: true },
  });
  console.log(`created ADMIN ${user.email} (id ${user.id})`);
  await prisma.$disconnect();
}

void main();
