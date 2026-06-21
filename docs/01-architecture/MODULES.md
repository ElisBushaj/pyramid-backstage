# Architecture — ops-core Module Map

> How `ops-core` is organized: feature **modules** (the CRUD + workflow surface) and cross-module **engines** (the shared correctness logic). The per-task build of these lives in [`docs/06-features/`](../06-features/); the conventions they hold are [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).

## The module file pattern

Every feature module under `src/modules/<feature>/` follows one shape:

```
src/modules/<feature>/
├── controller.ts   # thin: validate req, pull req.actor, call service, return.
│                   #   every method wears @controlledResponse(type). No business logic.
├── service.ts      # ALL business logic + ALL DB access (via config/prisma).
│                   #   returns ServiceResponse<T> (lists: PaginatedServiceResponse<T>).
├── routes.ts       # mounts under /api/v1/{public,private,admin}; requireAuth +
│                   #   requireRole + withIdempotency (on mutations).
├── validators.ts   # express-validator chains via ValidationHelpers.
└── *.test.ts       # Vitest, next to the implementation.
```

Controllers never hand-roll a status code or an error shape; services never reach outside `config/prisma`; errors are always `APIError` with a `messageKey`. See [`EXISTING_PATTERNS.md`](./EXISTING_PATTERNS.md).

## Feature modules

| Module | Owns | Tier / gate | Endpoints (see [contract](../04-api/CONTRACT.md)) |
|---|---|---|---|
| **auth** | Login, logout, session, `requireAuth` → `req.actor` (session **or** service-token + forwarded actor), `requireRole`/`requirePermission`, admin user CRUD | `public` (login) + `private` (me/logout) + `admin` (users) | `POST /public/auth/login`, `/private/auth/{logout,me}`, `/admin/users*` |
| **spaces** | Halls + transitional areas; capacities-per-layout, features, rate, buffers; **catalog-extension fields** (slug, category, zone, circulation, adjacency, map); matching + availability annotation | `private` (read), **OPS+** (write) | `GET/POST /private/spaces`, `PATCH /private/spaces/:id`, `GET /private/spaces/:id/availability` |
| **assets** | Typed inventory, aggregate counts, location, status; windowed availability; **scan → movement ledger** (records an `AssetMovement`, updates live `Asset.location`) | `private` (read), **OPS+** (write + scan) | `GET/POST /private/assets`, `PATCH /private/assets/:id`, `POST /private/assets/:id/scan`, `GET /private/assets/:id/movements` |
| **requests** | `EventRequest` CRUD, the lifecycle state machine, the `RequestAggregate` read; **`PARTNER` row-scoping** (`list`/`get` filter to `createdById` for partners) | `private`, **OPS+** to create (**PARTNER** creates + reads own) | `GET/POST /private/requests`, `GET /private/requests/:id` |
| **reservations** | Hold/confirm/release; the serializable, row-locked decrement; leases | `private`, **OPS+** | `POST /private/reservations`, `/reservations/:id/{confirm,release}` |
| **quotes** | Server-computed line items + VAT; versioning | `private`, **OPS+** | `POST /private/quotes` |
| **tasks** | Persist setup/teardown lists, compute `dueAt`; read | `private`, **OPS+** to write | `GET/POST /private/requests/:id/tasks` |
| **conflicts** | The proactive conflict read (over the engine) | `private` | `GET /private/conflicts` |
| **audit** | The append-only ledger read | `private` | `GET /private/audit` |
| **approvals** | `approve`/`reject` lifecycle transitions → confirm/release | `private`, **MANAGER+** | `POST /private/requests/:id/{approve,reject}` |

(Approvals and conflicts are thin surfaces over the requests/reservations services + the engines; they're called out separately because they have their own routes and role gates.)

### The asset-movement subsystem (F16)

Scanning lives **inside the assets module** — no new module. `POST /assets/:id/scan` (QR/NFC encodes only `assetId`) writes an `AssetMovement` row **and** updates the live `Asset.location` in **one transaction** alongside the audit entry — the same mutation discipline as every other write. `GET /assets/:id/movements` reads the ledger. This is **aggregate-with-movement**, not per-unit serialized identity: the ledger tracks *where the count is*, not which individual chair moved ([ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md), [docs/02-domain/ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md)). The movement ledger drives the "where is it" dashboard widget.

### Partner row-scoping (F15)

The `requests` service gains an actor-aware filter: when `req.actor.role === 'PARTNER'`, `list` and `get` constrain to `createdById === req.actor.id` — a partner literally cannot read another partner's request (a not-found, not a 403, to avoid leaking existence). All other roles see the full set. Intake itself is unchanged; only the read scope narrows. See [docs/02-domain/PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md) and [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md).

### The service-token auth path (F17)

`requireAuth` gains a **second branch**. Today it resolves the `pb_session` cookie → `req.actor`. The new branch: a request bearing the `OPS_CORE_SERVICE_TOKEN` is the **AI as a system actor**, with the acting user supplied via `X-Acting-User-Id` / `X-Acting-User-Role` headers — so audit and partner row-scoping see the **real human behind the AI**, distinct from the `actorId=null` reaper system actor. The forwarded role is **ceiling-clamped** (a compromised AI cannot self-grant ADMIN). Details and the trust model in [SECURITY.md](./SECURITY.md) and [ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md).

## Cross-module engines (`src/services/`)

The shared correctness logic that more than one module depends on. Kept out of any single module so it has one home and one test suite.

| Engine | Responsibility | Consumed by | Reference |
|---|---|---|---|
| **availability/** | Windowed space + asset availability (read-only): buffer-padded overlap; `availableQuantity = total − Σ overlapping holds` as one grouped query | `GET /spaces`, `GET /assets`, `GET /spaces/:id/availability` | [docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md) |
| **conflict/** | `detectConflicts(spaceId?, window, requestedAssets?)` → `Conflict[]` (the three types) | `GET /conflicts` **and** defensively *inside* the reservation transaction (authoritative) | [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md) |
| **pricing/** | Quote composition: line items, `net`, `round(net × 0.20)` VAT, `total` — all integer minor units | the quotes module | [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md), [docs/02-domain/QUOTES.md](../02-domain/QUOTES.md) |
| **reservation/** | The atomic hold/confirm/release transaction logic (serializable + row locks + lease) | the reservations module | [docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md) |

The **availability** and **conflict** engines are the correctness core ([`F05`](../06-features/F05-availability-conflict/)) — **unit + property tested**. They share `utils/time.ts` (half-open overlap, effective windows) so interval math is never hand-rolled.

## Shared foundation (`src/`)

| Location | What |
|---|---|
| `controllers/_core.ts` | `@controlledResponse(type)` — the envelope/status/error serializer. |
| `utils/money.ts` | Integer minor-unit arithmetic. **No floats touch money.** |
| `utils/time.ts` | UTC-canonical date math: `overlaps()` (half-open), `effectiveWindow()`. **No hand-rolled intervals.** |
| `utils/validation.utils.ts` | `ValidationHelpers` over `express-validator`. |
| `config/prisma` | The single DB client services go through. |
| `types/api/<area>.ts` | The hand-mirrored DTOs ([ADR-0008](../08-decisions/0008-hand-mirrored-api-types.md)). |
| `types/message-keys.ts` + `locales/{al,en}.json` | The i18n registry (key counts must match across locales). |
| `routes/v1/{public,private,admin}/index.ts` | The tier mount points; feature routers register here. |

## Dependency shape

```
auth ──► (req.actor) ──► every mutating module ──► audit (same txn)
                                   │
spaces ─┐                          ▼
assets ─┼──► availability engine ──► conflict engine ──► reservation engine
requests┘                                   ▲                  │
                                            └── (authoritative check inside the txn)
quotes ◄── pricing engine            approvals ──► reservation confirm/release
tasks  ◄── (dueAt from the reserved window)
```

`auth` (`F01`) and the foundation (`F00`) underpin everything; the engines (`F05`) underpin reservations/availability; reservations (`F06`) underpin quotes/tasks/approvals. This is the build order in [`MASTER_PLAN.md`](../00-strategy/MASTER_PLAN.md) §2.

## Frontend command modules (the F14–F19 surfaces)

`ops-core` is the focus of this page, but the expansion lands matching **frontend command modules** under `frontend/src/components/command/` — the client-side counterparts to the new endpoints:

| Frontend module | Renders | Reads |
|---|---|---|
| **FloorMap** (F19) | A v1 radial floor map (status per space: `free`/`main`/`bundle`/`conflict`/`circulation`) behind `<FloorMap floor spaces={[{slug,status}]} />` | `Space.map` (catalog) + `/plan` output. v2 (real-plan SVG hotspots) is post-demo. [docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md) |
| **Partner portal** (F15) | Partner-scoped intake form + "my requests" list | row-scoped `/private/requests` |
| **Scanner** (F16) | Mobile scan UI + a "where is it" dashboard widget | `POST /assets/:id/scan`, `GET /assets/:id/movements` |
| **CopilotPanel** (F18) | The now-live chat surface (degrades to a canned response if AI is down) | `POST /chat`, `POST /plan` via `VITE_AI_URL` |

`bundleTemplates` and `circulationRules` ship as a **frontend constant**, not a contract endpoint ([docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md), [ADR-0014](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md)).

## Cross-references

- **Patterns (non-negotiable):** [`EXISTING_PATTERNS.md`](./EXISTING_PATTERNS.md), [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).
- **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md). **Per-feature work:** [`docs/06-features/`](../06-features/).
- **Security model:** [`SECURITY.md`](./SECURITY.md). **AI wire:** [`docs/04-api/AI_CONTRACT.md`](../04-api/AI_CONTRACT.md).
