# Runbook — operating Pyramid Backstage

> Bring-up, environment, and the common operational tasks. The authoritative infra source is [`infrastructure/docker-compose.yml`](../../infrastructure/docker-compose.yml) + [`infrastructure/README.md`](../../infrastructure/README.md); the architecture view is [`docs/01-architecture/INFRASTRUCTURE.md`](../01-architecture/INFRASTRUCTURE.md). For the demo flow, see [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md).

## Bring-up

From [`infrastructure/`](../../infrastructure/):

```bash
docker compose up                 # whole system: db, nats, redis, chromadb, ops-core, ai-orchestrator, frontend
docker compose up -d              # detached
docker compose --profile mock up  # additionally start mock-ops-core on :4010 (isolated AI/FE dev)
docker compose down               # stop, keep volumes
docker compose down -v            # stop and WIPE all data volumes
```

A bare `docker compose up` needs **no `.env`** — every variable falls back to a dev default. `ops-core` waits for `db` + `nats` + `redis` to be healthy, then exposes `GET /ready`.

**Seed the demo data** (4 halls Blue/Orange/Green/Yellow + transitional areas, realistic inventory, the four staff roles, and a **planted conflict**):

```bash
cd ops-core && pnpm db:seed
```

**Where things listen** (host defaults — full table in [`infrastructure/README.md`](../../infrastructure/README.md)):

| Service | URL |
|---|---|
| ops-core | `http://localhost:4000` (`/health`, `/ready`, `/api/v1/...`) |
| ai-orchestrator | `http://localhost:8000` (or the mock on `:4010`) |
| frontend | `http://localhost:5173` |
| Postgres / NATS / NATS monitor / Redis / ChromaDB | `:5432` / `:4222` / `:8222` / `:6379` / `:8001` |

## Environment variables (the ones you'll touch)

Resolved with `${VAR:-default}`; the defaults are **local-dev only**.

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_{DB,USER,PASSWORD}` | `pyramid` | the DB. |
| `SESSION_SECRET` | `dev-session-secret-change-me` | **rotate for any real deploy** (see § rotate session secret). |
| `FRONTEND_URL` | `http://localhost:5173` | ops-core CORS origin. |
| `OPS_CORE_URL` | `http://ops-core:4000/api/v1` | the AI's one coupling; point at the mock to isolate. |
| `ANTHROPIC_API_KEY` | *(empty)* | set to drive the real AI. |
| `NATS_ENABLED` | `true` | set **`false`** to run REST-only (degrade — see § NATS down). |

Drop a `.env` next to the compose file, or export in the shell, to override. Each app also ships a `.env.example`.

## Common operations

### Reset demo data (between runs)

A prior demo can leave `HELD`/`CONFIRMED` reservations that change what the planted conflict does. To reset to a clean seed:

```bash
# from infrastructure/
docker compose down -v          # wipe volumes (nukes Postgres + NATS + Redis state)
docker compose up -d
cd ../ops-core && pnpm db:seed  # re-seed halls, inventory, staff, planted conflict
```

For a faster reset that keeps the containers (re-runs migrations + seed against the existing DB), use the ops-core reset script (`pnpm db:reset` if present) — otherwise the `down -v` path above is the reliable one. Clearing **just** the idempotency cache / lapsed holds is rarely needed (the reaper releases lapsed `HELD` leases automatically).

### NATS down → degrade to REST-only

The live dashboard rides NATS, but the **core loop does not depend on it** ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)). If NATS is unhealthy, or you want to demo the degrade path:

```bash
NATS_ENABLED=false docker compose up    # ops-core runs REST-only; dashboard polls
```

In this mode: events are not published (the `OutboxEvent` rows accumulate harmlessly or are skipped per config), the dashboard refreshes on poll instead of live, and the proactive AI conflict heads-up is not pushed (the conflict still surfaces synchronously via the `409`). **Everything in the request→plan→approve loop still works.** `GET /ready` will reflect NATS being down (it checks DB **and** NATS) — expected in degrade mode. To recover: bring NATS back healthy and restart `ops-core` with `NATS_ENABLED=true`; the relay drains any backlog of unpublished outbox rows.

### Rotate the session secret

`SESSION_SECRET` signs the `pb_session` cookie. The compose default is a known dev value and **must be rotated** for any non-local deployment:

1. Generate a strong secret (e.g. `openssl rand -base64 48`).
2. Set `SESSION_SECRET=<new value>` in the environment (`.env` or your secret manager) and restart `ops-core`.
3. **Rotating invalidates existing sessions** — all staff must log in again. The server-side session store means this is clean (no stale tokens float around), which is exactly why httpOnly server sessions were chosen ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)). Do it during a quiet window.

(A real `create-admin` provisioning flow and broader secret hardening are Phase-4 backlog — [`ROADMAP.md`](../00-strategy/ROADMAP.md), [`SECURITY.md`](../01-architecture/SECURITY.md).)

## Health checks

| Check | Command | Healthy |
|---|---|---|
| ops-core liveness | `curl localhost:4000/health` | `200` |
| ops-core readiness (DB + NATS) | `curl -i localhost:4000/ready` | `200` ready · `503` a dependency is down |
| ai-orchestrator | `curl localhost:8000/health` | `200` |
| Postgres | `docker compose exec db pg_isready` | accepting connections |
| NATS / JetStream | `curl localhost:8222/healthz` (monitor) | `200` |
| Redis | `docker compose exec redis redis-cli ping` | `PONG` |

Compose runs these as container healthchecks too; `docker compose ps` shows each service's health at a glance. See [`docs/01-architecture/OBSERVABILITY.md`](../01-architecture/OBSERVABILITY.md).

## Where the logs and the audit live

- **Application logs** — `ops-core` logs **structured JSON via pino** to stdout. `docker compose logs -f ops-core` (or your aggregator). A failed request logs its `APIError` `messageKey` + status, so failures are greppable by their canonical machine string ([ERROR_CONTRACT](../04-api/ERROR_CONTRACT.md)).
- **The decision record** — the **`AuditEntry` ledger** in Postgres is the answer to *"who did this?"*: append-only, written with the real `req.actor` on every mutation. Query it via `GET /private/audit?requestId=...` (or directly in the DB). This, not the app logs, is where you reconstruct what the system decided ([docs/02-domain/AUDIT.md](../02-domain/AUDIT.md)).
- **The live activity** — subscribe to the NATS subjects (or watch the monitor at `:8222`) to see the system's events in real time.
- **Data** — Postgres state is in the `pyramid_db_data` named volume; NATS in `pyramid_nats_data`; Redis in `pyramid_redis_data`. `docker compose down -v` wipes all three.

## Quick troubleshooting

| Symptom | First check |
|---|---|
| `ops-core` won't start | `docker compose ps` — is `db`/`nats`/`redis` healthy? It waits for them. |
| `/ready` returns `503` | which dependency: DB or NATS? (`down -v` + up if Postgres; see § NATS down if NATS.) |
| Login fails for a seeded user | re-run `pnpm db:seed`; confirm `SESSION_SECRET` didn't change mid-session (rotating logs everyone out). |
| Dashboard not updating live | NATS health (`:8222`); `NATS_ENABLED`; outbox table for unpublished rows (relay lag). |
| Mutation rejected with `409 idempotency_key_mismatch` | the same `Idempotency-Key` was reused with a different body — rotate the key ([ADR-0005](../08-decisions/0005-idempotency-keys.md)). |
| Planted conflict doesn't fire | the second window must overlap the seeded one's **effective** (buffer-padded) window. |

## Cross-references

- **Compose source & ports:** [`infrastructure/README.md`](../../infrastructure/README.md), [`docs/01-architecture/INFRASTRUCTURE.md`](../01-architecture/INFRASTRUCTURE.md).
- **The demo:** [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). **Observability:** [`docs/01-architecture/OBSERVABILITY.md`](../01-architecture/OBSERVABILITY.md). **Security/secrets:** [`docs/01-architecture/SECURITY.md`](../01-architecture/SECURITY.md).
