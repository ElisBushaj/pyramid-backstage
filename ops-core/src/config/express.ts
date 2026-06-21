import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { logger } from "./logger";
import { vars } from "./vars";
import { localeMiddleware } from "../middlewares/locale.middleware";
import { formatError } from "../controllers/_core";
import { prisma } from "./prisma";
import apiRoutes from "../routes";

export function createApp(): Express {
  const app = express();

  // Behind the nginx reverse proxy in production: trust the first hop so
  // req.ip / X-Forwarded-For resolve to the real client (correct rate-limit
  // buckets + secure-cookie detection), not nginx's container IP.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: vars.frontendUrl, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser(vars.sessionSecret));
  app.use(pinoHttp({ logger }));
  app.use(localeMiddleware);

  // Liveness — the process is up.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Readiness — DB reachable.
  app.get("/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: "not_ready", reason: String(err), timestamp: new Date().toISOString() });
    }
  });

  app.use("/api/v1", apiRoutes);

  // Global error fallback (controllers also catch inline via @controlledResponse).
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    formatError(err, req, res, next);
  });

  return app;
}
