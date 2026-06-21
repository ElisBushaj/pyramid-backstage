# Infrastructure

The full Pyramid Backstage stack runs from one `docker compose` file. Postgres,
NATS (JetStream), Redis, and ChromaDB are the backing services; `ops-core`,
`ai-orchestrator`, and the `frontend` are the apps. A stateful `mock-ops-core`
is available behind an opt-in profile for isolated development.

## Bring it up

From this directory:

```bash
docker compose up            # whole system, AI → real ops-core
docker compose up -d         # detached
docker compose --profile mock up   # additionally start mock-ops-core on :4010
docker compose down          # stop (keep volumes)
docker compose down -v       # stop and wipe all data volumes
```

A bare `docker compose up` needs **no `.env`** — every variable falls back to a
sane `${VAR:-default}`. To override (e.g. set `ANTHROPIC_API_KEY` for the AI
service, or a real `SESSION_SECRET`), drop a `.env` next to this file or export
the vars in your shell. Each app also ships its own `.env.example`.

## The mock profile

`mock-ops-core` carries a Compose profile, so it **only** starts with
`--profile mock`. It is a stateful, contract-accurate stand-in for `ops-core`,
useful when developing the AI orchestrator or frontend without the full Node +
Prisma + Postgres path. Point a consumer at it by overriding `OPS_CORE_URL`:

```bash
OPS_CORE_URL=http://mock-ops-core:4010/api/v1 docker compose --profile mock up
```

Without the flag, the mock never runs and the AI service talks to the real
`ops-core`.

## Ports

| Service           | In-container | Host (default)      | Override env          |
|-------------------|--------------|---------------------|-----------------------|
| `db` (Postgres)   | 5432         | 5432                | `DB_PORT`             |
| `nats` (client)   | 4222         | 4222                | `NATS_PORT`           |
| `nats` (monitor)  | 8222         | 8222                | `NATS_MONITOR_PORT`   |
| `redis`           | 6379         | 6379                | `REDIS_PORT`          |
| `chromadb`        | 8000         | 8001                | `CHROMA_PORT`         |
| `ops-core`        | 4000         | 4000                | `OPS_CORE_PORT`       |
| `ai-orchestrator` | 8000         | 8000                | `AI_PORT`             |
| `mock-ops-core`   | 4010         | 4010 (profile only) | `MOCK_OPS_CORE_PORT`  |
| `frontend`        | 5173         | 5173                | `FRONTEND_PORT`       |

ChromaDB is the one remap: its container listens on 8000, exposed on host
**8001** so it doesn't collide with `ai-orchestrator` (also 8000).

## Environment variables

Resolved with `${VAR:-default}` in `docker-compose.yml`; defaults are for local
dev only.

| Variable             | Default                                  | Used by           |
|----------------------|------------------------------------------|-------------------|
| `POSTGRES_DB`        | `pyramid`                                | db, ops-core      |
| `POSTGRES_USER`      | `pyramid`                                | db, ops-core      |
| `POSTGRES_PASSWORD`  | `pyramid`                                | db, ops-core      |
| `SESSION_SECRET`     | `dev-session-secret-change-me`           | ops-core          |
| `FRONTEND_URL`       | `http://localhost:5173`                  | ops-core (CORS)   |
| `OPS_CORE_URL`       | `http://ops-core:4000/api/v1`            | ai-orchestrator   |
| `ANTHROPIC_API_KEY`  | _(empty)_                                | ai-orchestrator   |
| `VITE_OPS_CORE_URL`  | `http://localhost:4000/api/v1`           | frontend          |
| `VITE_AI_URL`        | `http://localhost:8000`                  | frontend          |

Service-internal wiring (`REDIS_URL=redis://redis:6379`,
`NATS_URL=nats://nats:4222`, `CHROMA_URL=http://chromadb:8000`,
`DATABASE_URL=...@db:5432/...`) is fixed to the Compose network and not meant to
be overridden for local dev.

## Health & dependencies

Every backing service has a healthcheck; `ops-core` waits for `db`, `nats`, and
`redis` to be **healthy** before starting, and exposes `GET /ready` (DB + NATS
reachable) as its own probe. `ai-orchestrator` exposes `GET /health`, the
frontend serves the Vite dev server on `:5173`.

## Seeding the database

On a fresh stack the `ops-core` container migrates the schema **and** reconciles
the space catalog on boot (`npm run db:seed:spaces`), so the venue's spaces are
present immediately — no manual step. That catalog sync is idempotent and
catalog-only (it upserts every space in `docs/03-data/spaces.catalog.json` and
prunes rows the catalog dropped, but never one that already has reservations).

For the full demo dataset — users you can log in as, plus the three seeded events
and the planted Blue-Hall conflict — run the full seed once against the running
`ops-core`:

```bash
docker compose exec ops-core npm run db:seed         # spaces + assets + users + demo events
docker compose exec ops-core npm run db:seed -- --reset   # wipe domain data first, then reseed
docker compose exec ops-core npm run db:seed:spaces  # ONLY reconcile the space catalog (prod-safe)
```

`db:seed:spaces` is the same command `scripts/deploy.sh` runs on **every** deploy,
so catalog growth (new floors/halls) always reaches a live database; it touches no
users or events and is therefore safe under `NODE_ENV=production`.

## Database init

`db/init.sql` runs once on a fresh volume: it pins the database timezone to UTC
and creates the `pgcrypto` + `citext` extensions. The **schema** is owned by
Prisma — migrations live in `ops-core/prisma`, applied by `ops-core` (`prisma
migrate deploy`), never here.
