-- ─────────────────────────────────────────────────────────────────────────────
-- Pyramid Backstage — Postgres bootstrap.
--
-- Runs once, on an empty data volume, via the postgres image's
-- /docker-entrypoint-initdb.d hook. Prisma owns the schema (migrations live in
-- ops-core/prisma); this file only sets database-wide invariants Prisma can't.
--
-- Invariant: the store and the wire are ALWAYS UTC (see docs/04-api/CONTRACT.md
-- rule 4). Europe/Tirane wall-clock is a frontend display concern.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER DATABASE pyramid SET timezone TO 'UTC';
SET TIME ZONE 'UTC';

-- gen_random_uuid() for any default UUIDs the schema may want.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Case-insensitive text for citext columns (e.g. user email uniqueness).
CREATE EXTENSION IF NOT EXISTS citext;
