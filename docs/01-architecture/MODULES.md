# Architecture — ops-core Module Map

> How `ops-core` is organized: feature **modules** (the CRUD + workflow surface), cross-module **engines** (the shared correctness logic), and the **events/outbox** plumbing. The per-task build of these lives in [`docs/06-features/`](../06-features/); the conventions they hold are [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).

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
| **auth** | Login, logout, session, `requireAuth` → `req.actor`, `requireRole`/`requirePermission`, admin user CRUD | `public` (login) + `private` (me/logout) + `admin` (users) | `POST /public/auth/login`, `/private/auth/{logout,me}`, `/admin/users*` |
| **spaces** | Halls + transitional areas; capacities-per-layout, features, rate, buffers; matching + availability annotation | `private` (read), **OPS+** (write) | `GET/POST /private/spaces`, `PATCH /private/spaces/:id`, `GET /private/spaces/:id/availability` |
| **assets** | Typed inventory, aggregate counts, location, status; windowed availability | `private` (read), **OPS+** (write) | `GET/POST /private/assets`, `PATCH /private/assets/:id` |
| **requests** | `EventRequest` CRUD, the lifecycle state machine, the `RequestAggregate` read | `private`, **OPS+** to create | `GET/POST /private/requests`, `GET /private/requests/:id` |
| **reservations** | Hold/confirm/release; the serializable, row-locked decrement; leases | `private`, **OPS+** | `POST /private/reservations`, `/reservations/:id/{confirm,release}` |
| **quotes** | Server-computed line items + VAT; versioning | `private`, **OPS+** | `POST /private/quotes` |
| **tasks** | Persist setup/teardown lists, compute `dueAt`; read | `private`, **OPS+** to write | `GET/POST /private/requests/:id/tasks` |
| **conflicts** | The proactive conflict read (over the engine) | `private` | `GET /private/conflicts` |
| **audit** | The append-only ledger read | `private` | `GET /private/audit` |
| **approvals** | `approve`/`reject` lifecycle transitions → confirm/release + emit | `private`, **MANAGER+** | `POST /private/requests/:id/{approve,reject}` |

(Approvals and conflicts are thin surfaces over the requests/reservations services + the engines; they're called out separately because they have their own routes and role gates.)

## Cross-module engines (`src/services/`)

The shared correctness logic that more than one module depends on. Kept out of any single module so it has one home and one test suite.

| Engine | Responsibility | Consumed by | Reference |
|---|---|---|---|
| **availability/** | Windowed space + asset availability (read-only): buffer-padded overlap; `availableQuantity = total − Σ overlapping holds` as one grouped query | `GET /spaces`, `GET /assets`, `GET /spaces/:id/availability` | [docs/02-domain/CONFLICTS.md](../02-domain/CONFLICTS.md) |
| **conflict/** | `detectConflicts(spaceId?, window, requestedAssets?)` → `Conflict[]` (the three types) | `GET /conflicts` **and** defensively *inside* the reservation transaction (authoritative) | [ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md) |
| **pricing/** | Quote composition: line items, `net`, `round(net × 0.20)` VAT, `total` — all integer minor units | the quotes module | [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md), [docs/02-domain/QUOTES.md](../02-domain/QUOTES.md) |
| **reservation/** | The atomic hold/confirm/release transaction logic (serializable + row locks + lease) | the reservations module | [docs/02-domain/RESERVATIONS.md](../02-domain/RESERVATIONS.md) |

The **availability** and **conflict** engines are the correctness core ([`F05`](../06-features/F05-availability-conflict/)) — **unit + property tested**. They share `utils/time.ts` (half-open overlap, effective windows) so interval math is never hand-rolled.

## Events / outbox

Not a feature in the user sense, but a cross-cutting mechanism every mutation touches:

- **`OutboxEvent`** table — domain events written **in the same transaction** as the state change + `AuditEntry`.
- **The relay** — polls unpublished `OutboxEvent` rows, publishes to NATS, stamps `publishedAt`. At-least-once; consumers idempotent.
- **Subjects:** `request.created`, `reservation.held`, `reservation.confirmed`, `conflict.detected`, `request.approved`, `inventory.low`.
- **Degrade switch:** `NATS_ENABLED=false` runs REST-only.

See [ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md) and [docs/02-domain/AUDIT.md](../02-domain/AUDIT.md).

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
auth ──► (req.actor) ──► every mutating module ──► audit + outbox (same txn)
                                   │
spaces ─┐                          ▼
assets ─┼──► availability engine ──► conflict engine ──► reservation engine
requests┘                                   ▲                  │
                                            └── (authoritative check inside the txn)
quotes ◄── pricing engine            approvals ──► reservation confirm/release + emit
tasks  ◄── (dueAt from the reserved window)
```

`auth` (`F01`) and the foundation (`F00`) underpin everything; the engines (`F05`) underpin reservations/availability; reservations (`F06`) underpin quotes/tasks/approvals. This is the build order in [`MASTER_PLAN.md`](../00-strategy/MASTER_PLAN.md) §2.

## Cross-references

- **Patterns (non-negotiable):** [`EXISTING_PATTERNS.md`](./EXISTING_PATTERNS.md), [`docs/04-api/CORE_PATTERNS.md`](../04-api/CORE_PATTERNS.md).
- **The contract:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md). **Per-feature work:** [`docs/06-features/`](../06-features/).
- **Security model:** [`SECURITY.md`](./SECURITY.md).
