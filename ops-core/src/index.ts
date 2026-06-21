import { createApp } from "./config/express";
import { prisma } from "./config/prisma";
import { logger } from "./config/logger";
import { vars } from "./config/vars";

async function main(): Promise<void> {
  const app = createApp();

  const server = app.listen(vars.port, () => {
    logger.info(`ops-core listening on :${vars.port} (${vars.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
