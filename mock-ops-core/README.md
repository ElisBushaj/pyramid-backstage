# mock-ops-core

> A **stateful**, in-memory mock of `ops-core` (TypeScript + Express 5, run with
> `tsx`). It exists so the AI's **deterministic conflict branch is testable in
> isolation** — something a static mock (Prism replaying OpenAPI examples) cannot
> do, because it has no state.

It honors the contract **shapes**, the **`ServiceResponse` envelope**
(`{ status, message, messageKey, data }`), the **error contract** bodies, and —
critically — the **real buffer-aware reservation `409` conflict path**. It is
**not** a substitute for the real `ops-core` (no DB, no auth, no NATS, no
idempotency cache, no reaper thread). It models the conflict semantics; that's
the point.

**No auth** — the real `ops-core` gates `/private` behind a session cookie; the
mock deliberately skips it so the AI can call it with zero ceremony. (Noted in a
`server.ts` comment too — do not copy this into `ops-core`.)

Listens on **`:4010`** (deliberately different from real ops-core's `:4000`).

---

## The planted conflict

The seed inserts **one pre-existing `CONFIRMED` reservation**, `resv_planted`
(request `req_planted`):

- **Blue Hall** (`space_blue`), all day **2026-07-22, 07:00–20:00 Z** event window
  (Blue's buffers: 240 min setup / 120 min teardown → effective window
  ~03:00–22:00 Z),
- holding **360 of 400** standard chairs (leaves **40** free in that window) and
  **8 of 12** mics (leaves **4**).

So, against the seed:

| New hold | Result |
|---|---|
| Blue Hall, any window overlapping 07:00–20:00 Z on 2026-07-22 | **`409` `SPACE_DOUBLE_BOOKED`** |
| Blue Hall, back-to-back window that only collides in the buffer zone | **`409` `SETUP_WINDOW_OVERLAP`** |
| Any hold (any space) wanting **> 40** `asset_chair_std` in an overlapping window | **`409` `ASSET_OVERALLOCATED`** (`requested`/`available` populated) |
| Orange/Green/Yellow, same window, within free inventory | **`201`** HELD (clean) |

The `409` body is the exact agent-facing shape:

```jsonc
{ "status": 409, "error": "conflict", "messageKey": "reservation.conflict",
  "conflicts": [
    { "type": "SPACE_DOUBLE_BOOKED", "spaceId": "space_blue",
      "conflictingRequestIds": ["req_planted"],
      "window": { "start": "2026-07-22T07:00:00Z", "end": "2026-07-22T20:00:00Z" },
      "detail": "Blue Hall already reserved for req_planted in this window." } ] }
```

## How the AI points at it

`ai-orchestrator`'s planning graph calls `POST /reservations` in its
`hold_reservation` node. The mock returns the real `409 { conflicts }`; the
`ops_core_client` raises a typed `OpsCoreConflict` carrying the parsed
`Conflict[]`; the graph's conditional edge routes to the `alternatives` node and
assembles an **infeasible** `OperationalPlan` whose narrative explains *why*
("Blue is taken on the 22nd…") and offers the unused alternate windows. Point the
AI at the mock with one env var:

```bash
OPS_CORE_URL=http://localhost:4010/api/v1
```

---

## The correctness core (copied from CONFLICTS.md)

- **Half-open overlap**: `[aStart,aEnd)` and `[bStart,bEnd)` overlap iff
  `aStart < bEnd && bStart < aEnd`. Touching windows (14:00 ends / 14:00 starts)
  do **not** overlap.
- **Buffer-aware effective window**: `effectiveStart = start − setupBuffer`,
  `effectiveEnd = end + teardownBuffer`. Availability + conflict detection always
  test the **effective** window (each holder against **its own** space's buffers).
- **Asset availability**: `available = totalQuantity − Σ quantity` over every
  **active** reservation line whose effective window overlaps the query window.
  `HELD` counts only while `expiresAt > now` (defensive check-on-read, standing in
  for the reaper); `CONFIRMED` always counts; `RELEASED` never does.
- **Type split**: effective windows overlap **and** event windows overlap →
  `SPACE_DOUBLE_BOOKED`; effective overlap **without** event overlap →
  `SETUP_WINDOW_OVERLAP`.

---

## Run it

```bash
cd mock-ops-core
npm install
npm run dev          # tsx watch server.ts  (hot reload)
# or: npm start      # tsx server.ts
# → http://localhost:4010/api/v1
```

Trigger the planted conflict:

```bash
# 1) create a request
curl -s localhost:4010/api/v1/private/requests -H 'content-type: application/json' -d '{
  "title":"Conflicting Conf","organizerName":"Acme","expectedAttendees":180,
  "eventType":"CONFERENCE",
  "preferredDates":[{"start":"2026-07-22T09:00:00Z","end":"2026-07-22T17:00:00Z"}]
}'

# 2) try to hold Blue Hall in the planted window → 409 conflict
curl -s -i localhost:4010/api/v1/private/reservations -H 'content-type: application/json' -d '{
  "requestId":"req_x","spaceId":"space_blue",
  "dateRange":{"start":"2026-07-22T09:00:00Z","end":"2026-07-22T17:00:00Z"},
  "assets":[{"assetId":"asset_chair_std","quantity":180}]
}'
# → HTTP/1.1 409 Conflict  { "error":"conflict", "conflicts":[ { "type":"SPACE_DOUBLE_BOOKED", … } ] }

# 3) asset over-allocation in a *different* space (only 40 chairs free in window)
curl -s -i localhost:4010/api/v1/private/reservations -H 'content-type: application/json' -d '{
  "requestId":"req_y","spaceId":"space_orange",
  "dateRange":{"start":"2026-07-22T09:00:00Z","end":"2026-07-22T17:00:00Z"},
  "assets":[{"assetId":"asset_chair_std","quantity":100}]
}'
# → 409 ASSET_OVERALLOCATED  (requested:100, available:40)
```

### Docker (dev)

```bash
docker build -f Dockerfile.dev -t mock-ops-core:dev .
docker run --rm -p 4010:4010 mock-ops-core:dev
```

---

## Endpoints

All under `/api/v1/private` (plus `/health`, `/ready`):

| Method & path | Purpose |
|---|---|
| `GET /private/spaces?minCapacity&layout&start&end` | Match + filter spaces; `available` when start&end given |
| `GET /private/spaces/:id/availability?start&end` | One space, buffer-aware |
| `GET /private/assets?type&start&end` | Inventory; `availableQuantity` when windowed |
| `POST /private/requests` | Create an event request |
| `GET /private/requests/:id` | Full aggregate |
| `POST /private/requests/:id/tasks` | Persist setup/teardown tasks |
| `POST /private/reservations` | **Atomic hold → `201` or real `409 {conflicts}`** |
| `POST /private/reservations/:id/confirm` | `HELD → CONFIRMED` (idempotent; `409` if lapsed/illegal) |
| `POST /private/reservations/:id/release` | Back to inventory |
| `POST /private/quotes` | VAT 20%, `totalMinor` server-computed |
| `GET /private/conflicts?spaceId&start&end` | Proactive conflict check |
