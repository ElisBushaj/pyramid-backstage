import { createApp } from "./config/express";
import { initNats, closeNats } from "./config/nats";
import { prisma } from "./config/prisma";
import { logger } from "./config/logger";
import { vars } from "./config/vars";

async function main(): Promise<void> {
  await initNats();
  const app = createApp();

  const server = app.listen(vars.port, () => {
    logger.info(`ops-core listening on :${vars.port} (${vars.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    server.close();
    await closeNats();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();
