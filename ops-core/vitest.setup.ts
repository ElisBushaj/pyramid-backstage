// Unit tests stub Prisma via vi.mock and never connect. Integration tests
// (src/__tests__/*) do NOT mock Prisma, so they connect to the dedicated test DB
// below — created + migrated out of band (see README / CI).
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://pyramid:pyramid@localhost:5432/pyramid_test";
process.env.SESSION_SECRET ??= "test-secret";
process.env.OPS_CORE_SERVICE_TOKEN ??= "test-service-token"; // F17 — exercised by service-token.test.ts
process.env.LOG_LEVEL ??= "silent";
