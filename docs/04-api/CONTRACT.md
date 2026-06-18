# The Contract

> `ops-core/openapi.yaml` is the **single source of truth**. This page is the prose around it.

The two services (`ops-core`, `ai-orchestrator`) share **only** the payload shapes in `openapi.yaml`. Neither imports the other's code. The only runtime coupling is one env var on the AI side: `OPS_CORE_URL`. `ai-orchestrator` treats each `ops-core` endpoint as a LangGraph **tool**.

## The rules

1. **Lock at Hour 0, additive-only after.** Add a field — never rename or remove one. A genuinely breaking change is a 5-minute sync where both sides update together, recorded as a new ADR.
2. **`ops-core/openapi.yaml` wins all disputes.** If code and the contract disagree, the code is wrong.
3. **Enums are `UPPER_SNAKE`.** Statuses, types, roles — all of them. Pinned so mock and real never drift on casing.
4. **All timestamps are RFC-3339 UTC with a trailing `Z`.** The venue's wall-clock (Europe/Tirane, UTC+1/+2) is a *display* concern handled in the frontend; the store and the wire are always UTC.
5. **All money is integer minor units** in the `*Minor` fields. Albanian Lek (`ALL`) has no subunit in practice, so the factor is 1 — but the integer discipline still holds (no floats ever touch money). See [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md).
6. **`Quote.totalMinor` is server-computed.** `net = Σ subtotals`, `vat = round(net × vatRate)`, `total = net + vat`. Clients never send a total; if they do, it's ignored.
7. **Every mutating request carries `Idempotency-Key`** (UUID v4). Replays return the original response; a body mismatch under the same key → `409`. See [ADR-0005](../08-decisions/0005-idempotency-keys.md).
8. **Reservations are leases.** A `HELD` reservation has an `expiresAt`; a background reaper releases lapsed holds so inventory never leaks. `CONFIRMED` clears `expiresAt`.

## The envelope

Every success response is wrapped:

```jsonc
{ "status": "OK", "message": "...", "messageKey": "request.created.success", "data": <T> }
```

`data` is the typed payload (`T`). The frontend API client unwraps `data` by default. Errors use the [error contract](./ERROR_CONTRACT.md) shape instead.

## The tool surface (what the AI calls)

| Tool / Endpoint | Purpose | Returns |
|---|---|---|
| `POST /requests` | Create a structured event request | `EventRequest` |
| `GET /requests/:id` | Full aggregate (request+reservation+quote+tasks+conflicts+audit) | `RequestAggregate` |
| `GET /spaces?minCapacity&layout&start&end` | Match + filter spaces, with windowed availability | `SpaceWithAvailability[]` |
| `GET /spaces/:id/availability?start&end` | Check one space (buffer-aware) | `SpaceAvailability` |
| `GET /assets?type&quantity&start&end` | Inventory availability for a window | `AssetWithAvailability[]` |
| `POST /reservations` | Hold space + assets (atomic) | `Reservation` **or** `409 {conflicts}` |
| `POST /reservations/:id/confirm` | Confirm a held reservation | `Reservation` |
| `POST /quotes` | Generate a quote (VAT, server total) | `Quote` |
| `GET /conflicts?spaceId&start&end` | Proactive conflict check | `Conflict[]` |
| `POST /requests/:id/tasks` | Persist a setup/teardown task list | `Task[]` |
| `POST /requests/:id/approve` | Approve → confirm reservations → emit → audit (MANAGER+) | `EventRequest` |
| `POST /requests/:id/reject` | Reject + reason (MANAGER+) | `EventRequest` |
| `GET /audit?requestId` | Decision / change history | `AuditEntry[]` |

The AI's own endpoints (`POST /chat`, `POST /plan` → `OperationalPlan`) live on the Python side and are documented in [`docs/02-domain/AI_ORCHESTRATION.md`](../02-domain/AI_ORCHESTRATION.md). They are **not** part of `ops-core`.

## Auth tiers

Routes mount under `/api/v1/{public,private,admin}`:
- `public` — unauthenticated (`/auth/login`, health).
- `private` — any authenticated staff (VIEWER+). The whole tool surface lives here.
- `admin` — `ADMIN` role (staff/user management).

Role gates beyond the tier (e.g. approvals require `MANAGER+`, inventory writes require `OPS+`) are enforced per-route with `requireRole`. See [docs/01-architecture/SECURITY.md](../01-architecture/SECURITY.md).
