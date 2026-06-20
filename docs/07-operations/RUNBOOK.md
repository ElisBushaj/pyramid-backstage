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

**Seed the demo data** (4 halls Blue/Orange/Green/Yellow + transitional areas, realistic inventory, the four staff roles, a demo **partner** + 1–2 partner-created `PROPOSED` requests, and a **planted conflict**):

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
| `OPS_CORE_URL` | `http://ops-core:4000/api/v1` | the AI's one coupling; point at the mock to isolate (see § flip OPS_CORE_URL). |
| `OPS_CORE_SERVICE_TOKEN` | `dev-service-token-change-me` | the shared secret the AI presents to ops-core (`Authorization: Bearer …`) so its writes audit the real forwarded actor — set the **same value** on ops-core **and** the AI; **rotate for any real deploy** ([F17](../06-features/F17-ai-auth/SPEC.md), [ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md)). |
| `OPS_CORE_SERVICE_TOKEN_ROLE_CEILING` | `MANAGER` | the forwarded-role ceiling — a forwarded role above this is rejected `403`, so a compromised AI can't self-grant `ADMIN` ([F17](../06-features/F17-ai-auth/SPEC.md)). |
| `ANTHROPIC_API_KEY` | *(empty)* | set to drive the real AI; empty → the copilot runs **canned** (see § AI degrade-to-canned). |
| `VITE_AI_URL` | `http://localhost:8000` | the frontend's AI endpoint (`POST /chat` / `POST /plan`). **Unset/empty → the copilot degrades to canned without a network attempt** — the locked fallback ([F18](../06-features/F18-ai-wiring/SPEC.md)). |
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

### AI orchestrator → bring it up

The `ai-orchestrator` ([Alvin's service](../02-domain/AI_ORCHESTRATION.md)) serves the copilot's `POST /chat` + `POST /plan` ([AI_CONTRACT.md](../04-api/AI_CONTRACT.md)). A bare `docker compose up` already starts it on `:8000`; the frontend reaches it via `VITE_AI_URL`. To run it standalone (e.g. iterating on the AI alone):

```bash
# from ai-orchestrator/
uvicorn app.main:app --reload --port 8000     # local, hot-reload
# — or just the container —
docker compose up ai-orchestrator             # from infrastructure/
```

It needs three things wired: `ANTHROPIC_API_KEY` (to drive the real model), `OPS_CORE_URL` (the one coupling — where it reads/writes truth), and `OPS_CORE_SERVICE_TOKEN` (matching ops-core's, so its writes audit the real forwarded actor — [F17](../06-features/F17-ai-auth/SPEC.md)). Verify: `curl localhost:8000/health` → `200`. If the key is empty or the service is down, the copilot still works **canned** — see § AI degrade-to-canned.

### Flip `OPS_CORE_URL` (mock ↔ real)

`OPS_CORE_URL` is the AI's single coupling to ops-core. Point it at the real ops-core for the demo, or at the **stateful mock** ([`mock-ops-core/`](../../mock-ops-core/), `:4010`) to develop the AI in isolation:

```bash
# real ops-core (the demo default)
OPS_CORE_URL=http://ops-core:4000/api/v1 docker compose up ai-orchestrator
# the mock (isolated AI/FE dev) — start it via the mock profile first
docker compose --profile mock up -d mock-ops-core
OPS_CORE_URL=http://mock-ops-core:4010/api/v1 docker compose up ai-orchestrator
```

The mock speaks the same contract and accepts the service token as a no-op, so the seam is exercised identically — but it is **not** the system of record. For the actual demo (the planted conflict, the live approval flip, the scan ledger) run against **real** ops-core.

### Seed the demo PARTNER user

The seed provisions a demo **partner** (an external organiser, role `PARTNER` — below `VIEWER`) plus 1–2 partner-created `PROPOSED` requests so Beat 5 (the portal + approval queue) has data on a clean seed. Partners are admin-provisioned, same as staff (no self-signup — [F15](../06-features/F15-partner-portal/SPEC.md)). `pnpm db:seed` creates it; the partner logs in at `/portal`, sees only their own requests (row-scoped by `createdById`), and a `MANAGER` approves from the **Pending Approvals** queue. A cross-row read by a partner returns `404`, not `403` — by design ([ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md), [PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md)).

### Scanner demo prep (the asset QR)

Beat 6 scans a QR that encodes an **`assetId`** (aggregate-with-movement — the tag names an asset *line*, not a physical unit — [ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md)). Prep before the room:

1. Pick a demo asset (a microphone reads well). Get its `assetId` from `AssetDetail` — the page renders a printable per-asset QR encoding exactly that id ([F16](../06-features/F16-asset-tracking/SPEC.md)).
2. **Print or display** that QR (phone screen works) so the Scanner can decode it on the floor.
3. On the **Scanner** page (mobile-first), the camera decodes the QR → resolves the `assetId` → a `CHECK_OUT | CHECK_IN | RELOCATE` form that posts `POST /private/assets/:id/scan` (OPS+, idempotent).
4. **Camera unavailable?** The Scanner degrades to **manual `assetId` entry** — type the id from the QR label; the rest of the flow is identical. NFC is the same `assetId` payload over a different reader; the demo uses QR.

Reset note: scans accumulate `AssetMovement` rows and move `Asset.location`. To restore a clean "where is it?" baseline, re-seed (§ reset demo data).

### NATS down → degrade to REST-only

The live dashboard rides NATS, but the **core loop does not depend on it** ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)). If NATS is unhealthy, or you want to demo the degrade path:

```bash
NATS_ENABLED=false docker compose up    # ops-core runs REST-only; dashboard polls
```

In this mode: events are not published (the `OutboxEvent` rows accumulate harmlessly or are skipped per config), the dashboard refreshes on poll instead of live, and the proactive AI conflict heads-up is not pushed (the conflict still surfaces synchronously via the `409`). **Everything in the request→plan→approve loop still works.** `GET /ready` will reflect NATS being down (it checks DB **and** NATS) — expected in degrade mode. To recover: bring NATS back healthy and restart `ops-core` with `NATS_ENABLED=true`; the relay drains any backlog of unpublished outbox rows.

### AI down → degrade to canned

The copilot and the FloorMap are designed to **never block the demo** ([F18](../06-features/F18-ai-wiring/SPEC.md), [AI_CONTRACT.md](../04-api/AI_CONTRACT.md) § Degrade-to-canned). Two independent fallbacks, both automatic:

- **CopilotPanel → canned.** If `VITE_AI_URL` is unset/empty the panel makes **no network attempt** and runs canned turns; if it is set but the AI errors/times out, the same canned mode kicks in (no console error, no broken render). Force it for a dry-run:

  ```bash
  VITE_AI_URL= pnpm --filter frontend dev    # unset → guaranteed canned floor
  ```

- **FloorMap → catalog-only (v1).** The map is pure/presentational and renders from the venue catalog alone — with the AI down it still draws every floor, falling back to all-`free` or a request's confirmed space as `main` from ops-core aggregate data ([FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md) §5). It never blanks.

So Beat 1's plan still assembles (canned copilot → the deterministic ops-core loop), Beat 2's map still lights, and Beats 5/6 are ops-core-only and unaffected. To run the **real** AI, set `ANTHROPIC_API_KEY` + `VITE_AI_URL` and bring the orchestrator up (§ AI orchestrator). This degrade is the locked decision — the demo never depends on the AI being live.

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
| Copilot stuck "thinking" / canned only | `curl localhost:8000/health`; is `VITE_AI_URL` set and reachable, `ANTHROPIC_API_KEY` present? Empty/unreachable → canned by design (§ AI degrade-to-canned). |
| AI writes audit as "system" / not the human | `OPS_CORE_SERVICE_TOKEN` must match on ops-core **and** the AI, and the AI must forward `X-Acting-User-Id`/`X-Acting-User-Role` ([F17](../06-features/F17-ai-auth/SPEC.md)). |
| AI gets `403` forwarding a role | the forwarded role exceeds `OPS_CORE_SERVICE_TOKEN_ROLE_CEILING` (default `MANAGER`) — by design; raise the ceiling only if intended. |
| Partner sees `404` on a request | row-scoping — partners read only rows they created; a cross-row read returns `404`, not `403` ([F15](../06-features/F15-partner-portal/SPEC.md)). Expected. |
| Scan rejected `422` (over-checkout) | the `CHECK_OUT` quantity exceeds what's available to check out (`totalQuantity − Σ open checked-out`) — reduce the quantity or `CHECK_IN` first ([ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md)). |
| Scanner camera won't open | use manual `assetId` entry (§ scanner demo prep); the QR just encodes the id. |
| FloorMap blank / a wedge missing | a missing wedge is fine (circulation spaces omit sectors; partial catalog data is skipped silently). A fully blank map means the catalog constant didn't load ([FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md) §2.1). |

## Cross-references

- **Compose source & ports:** [`infrastructure/README.md`](../../infrastructure/README.md), [`docs/01-architecture/INFRASTRUCTURE.md`](../01-architecture/INFRASTRUCTURE.md).
- **The demo:** [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md). **Observability:** [`docs/01-architecture/OBSERVABILITY.md`](../01-architecture/OBSERVABILITY.md). **Security/secrets:** [`docs/01-architecture/SECURITY.md`](../01-architecture/SECURITY.md).
- **The AI surface & service-token seam:** [`docs/04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md), [`F17`](../06-features/F17-ai-auth/SPEC.md), [`F18`](../06-features/F18-ai-wiring/SPEC.md). **Partner portal:** [`docs/02-domain/PARTNER_PORTAL.md`](../02-domain/PARTNER_PORTAL.md). **Asset tracking:** [`docs/02-domain/ASSET_TRACKING.md`](../02-domain/ASSET_TRACKING.md). **FloorMap:** [`docs/05-frontend/FLOOR_MAP.md`](../05-frontend/FLOOR_MAP.md).
