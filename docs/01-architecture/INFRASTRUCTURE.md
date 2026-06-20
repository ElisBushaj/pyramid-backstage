# Architecture — Infrastructure

> The full system runs from one `docker compose`. This page is the orientation; the authoritative source is [`infrastructure/docker-compose.yml`](../../infrastructure/docker-compose.yml) and [`infrastructure/README.md`](../../infrastructure/README.md). Bring-up and ops procedures are in [`docs/07-operations/RUNBOOK.md`](../07-operations/RUNBOOK.md).

## The stack

One compose file brings up the whole system. A bare `docker compose up` needs **no `.env`** — every variable resolves via `${VAR:-default}`. All services share the `pyramid_net` bridge; state lives in named volumes.

| Service | Image / build | In-container port | Host (default) | Healthcheck |
|---|---|---|---|---|
| **db** | `postgres:17` | 5432 | 5432 (`DB_PORT`) | `pg_isready` |
| **nats** | `nats:2` (`-js -m 8222`) | 4222 / 8222 | 4222 / 8222 (`NATS_PORT` / `NATS_MONITOR_PORT`) | `GET :8222/healthz` |
| **redis** | `redis:7-alpine` (AOF on) | 6379 | 6379 (`REDIS_PORT`) | `redis-cli ping` |
| **chromadb** | `chromadb/chroma:latest` | 8000 | **8001** (`CHROMA_PORT`) | `GET /api/v1/heartbeat` |
| **ops-core** | `../ops-core` (Dockerfile.dev) | 4000 | 4000 (`OPS_CORE_PORT`) | `GET /ready` (DB + NATS) |
| **ai-orchestrator** | `../ai-orchestrator` (Dockerfile.dev) | 8000 | 8000 (`AI_PORT`) | `GET /health` |
| **mock-ops-core** | `../mock-ops-core` (Dockerfile.dev) | 4010 | 4010 (`MOCK_OPS_CORE_PORT`, **profile only**) | — |
| **frontend** | `../frontend` (Dockerfile.dev) | 5173 | 5173 (`FRONTEND_PORT`) | Vite dev server |

**ChromaDB is the one port remap:** its container listens on 8000 but is exposed on host **8001** so it doesn't collide with `ai-orchestrator` (also 8000).

## Dependencies & startup order

`ops-core` waits for `db`, `nats`, and `redis` to be **healthy** before starting, then exposes its own `GET /ready` (DB + NATS reachable) as the readiness gate. `ai-orchestrator` waits for `ops-core` (started) + `redis` (healthy) + `chromadb` (started). The `frontend` waits for `ops-core`. This ordering means a `docker compose up` converges to a working stack without manual sequencing.

## The `--profile mock` seam

`mock-ops-core` carries a Compose **profile**, so it **only** starts with `--profile mock`:

```bash
docker compose up                                       # whole system, AI → real ops-core
docker compose --profile mock up                        # additionally start mock-ops-core on :4010
OPS_CORE_URL=http://mock-ops-core:4010/api/v1 \
  docker compose --profile mock up                      # aim the AI at the mock
```

The mock is a **stateful, contract-accurate** stand-in for `ops-core` that honors the reservation `409 { conflicts }` path — so `ai-orchestrator` (or the frontend) can develop the conflict branch without the full Node + Prisma + Postgres path. This is the seam that makes the contract-only boundary ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)) practical: build against the mock, integrate by flipping one env var. Without `--profile mock`, the mock never runs and the AI talks to the real service.

## Database init vs. schema

`db/init.sql` runs **once** on a fresh volume: it pins the database timezone to **UTC** and creates the `pgcrypto` + `citext` extensions. The **schema itself is owned by Prisma** — migrations live in `ops-core/prisma`, applied by `ops-core` (`prisma migrate deploy`), never by the init script. (UTC-everywhere matches the contract's RFC-3339-`Z` rule; the venue wall-clock is a frontend display concern.)

## Key environment variables

Resolved with `${VAR:-default}`; defaults are local-dev only ([`infrastructure/README.md`](../../infrastructure/README.md) has the full table).

| Variable | Default | Used by |
|---|---|---|
| `POSTGRES_{DB,USER,PASSWORD}` | `pyramid` | db, ops-core |
| `SESSION_SECRET` | `dev-session-secret-change-me` | ops-core (**rotate for any real deploy** — see [SECURITY.md](./SECURITY.md)) |
| `FRONTEND_URL` | `http://localhost:5173` | ops-core (CORS) |
| `OPS_CORE_URL` | `http://ops-core:4000/api/v1` | ai-orchestrator (the one coupling) |
| `OPS_CORE_SERVICE_TOKEN` | `dev-service-token-change-me` | ai-orchestrator → ops-core (the service-token branch of `requireAuth`; **shared secret, rotate for any real deploy** — see [SECURITY.md](./SECURITY.md) § service-token model) |
| `ANTHROPIC_API_KEY` | *(empty)* | ai-orchestrator |
| `VITE_OPS_CORE_URL` / `VITE_AI_URL` | `:4000/api/v1` / `:8000` | frontend (`VITE_AI_URL` now **in use** — the `CopilotPanel` wire to `/chat` + `/plan`, [F18](../06-features/F18-ai-wiring/); degrades to a canned copilot if unset/unreachable) |

Service-internal wiring (`REDIS_URL`, `NATS_URL`, `CHROMA_URL`, `DATABASE_URL`) is fixed to the compose network and not meant to be overridden for local dev. The NATS degrade switch (`NATS_ENABLED=false`, [ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)) is the one knob that changes the runtime topology — see the cut-line in [`MASTER_PLAN.md`](../00-strategy/MASTER_PLAN.md) §5.

## CI overview

CI runs against the same stack shape (per [`CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md) and the per-task DoD in [`EXECUTION_PLAYBOOK.md`](../00-strategy/EXECUTION_PLAYBOOK.md)):

- **Type + lint:** `pnpm tsc --noEmit` clean.
- **Unit tests:** Vitest, Prisma stubbed; the availability/conflict engine adds **property tests**.
- **Integration tests:** real **Postgres** (+ NATS) service containers — no DB mocks — covering the concurrency path (two parallel `POST /reservations` → exactly one `409`).
- **Locale parity:** the key counts of `locales/al.json` and `en.json` must match.
- **Contract test (`F13`):** payloads validated against `openapi.yaml` — the drift gate for the hand-mirrored types ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)).

A fuller CI/CD pipeline (build + deploy + rollback + environment matrix) is production-hardening backlog ([`ROADMAP.md`](../00-strategy/ROADMAP.md) Phase 4).

## Cross-references

- **Bring-up & ops:** [`docs/07-operations/RUNBOOK.md`](../07-operations/RUNBOOK.md).
- **Compose source:** [`infrastructure/docker-compose.yml`](../../infrastructure/docker-compose.yml), [`infrastructure/README.md`](../../infrastructure/README.md).
- **The mock + the boundary:** [ADR-0001](../08-decisions/0001-two-services-one-contract.md). **Events/degrade:** [ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md).
- **Observability probes:** [`OBSERVABILITY.md`](./OBSERVABILITY.md).
