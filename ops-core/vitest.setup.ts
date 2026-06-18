// Unit tests never touch a real DB/NATS — services are stubbed via vi.mock.
// Integration tests (src/__tests__) set INTEGRATION=1 and use real services in CI.
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
process.env.SESSION_SECRET ??= "test-secret";
process.env.NATS_ENABLED ??= "false";
