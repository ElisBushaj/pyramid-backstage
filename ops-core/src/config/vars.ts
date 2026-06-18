/**
 * Centralized, fail-fast environment config. If a required var is missing the
 * process exits at startup — never a silent config error at request time.
 */
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    // eslint-disable-next-line no-console
    console.error(`[config] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const NODE_ENV = optional("NODE_ENV", "development");
const isTest = NODE_ENV === "test";

export const vars = {
  nodeEnv: NODE_ENV,
  isProd: NODE_ENV === "production",
  isTest,
  port: int("PORT", 4000),
  // In test we don't connect, so don't hard-require.
  databaseUrl: isTest
    ? optional("DATABASE_URL", "postgresql://stub:stub@localhost:5432/stub")
    : required("DATABASE_URL"),
  redisUrl: optional("REDIS_URL", "redis://localhost:6379"),
  natsUrl: optional("NATS_URL", "nats://localhost:4222"),
  natsEnabled: optional("NATS_ENABLED", "true") === "true",
  frontendUrl: optional("FRONTEND_URL", "http://localhost:5173"),
  sessionSecret: isTest ? "test-secret" : required("SESSION_SECRET"),
  sessionTtlHours: int("SESSION_TTL_HOURS", 12),
  holdMinutesDefault: int("HOLD_MINUTES_DEFAULT", 30),
  vatRate: Number(optional("VAT_RATE", "0.20")),
  logLevel: optional("LOG_LEVEL", "debug"),
} as const;

export type Vars = typeof vars;
