import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { vars } from "./vars";

// Prisma 7 driver-adapter pattern (matches the marketplace setup).
const adapter = new PrismaPg({ connectionString: vars.databaseUrl });

export const prisma = new PrismaClient({ adapter });

export default prisma;
