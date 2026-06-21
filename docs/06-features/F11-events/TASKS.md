---
id: F11
name: Events / NATS
last_updated: 2026-06-21
---

# F11 — Tasks

> **REMOVED — feature withdrawn as of 2026-06-21.** The NATS event bus, the `OutboxEvent` table, and the outbox relay were deleted from the project. See [ADR-0018](../../08-decisions/0018-remove-nats-event-subsystem.md). Tasks F11-T01 through F11-T06 (the events/outbox/NATS work) are retained **only as historical record** and must not be implemented; their IDs are stable and not renumbered. F11-T07 (calendar/live-timeline UI) is unrelated to the event subsystem and is unaffected.

### F11-T01 — OutboxEvent model + migration
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `OutboxEvent` exists in `ops-core/prisma/schema.prisma` with `id, subject, payload (Json), publishedAt? (DateTime), createdAt` per `docs/03-data/SCHEMA.md`.
  - `@@index([publishedAt])` is present so the relay can scan for unpublished rows (`publishedAt IS NULL`) without a full-table scan.
  - If F00-T06 already shipped the model complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F11-T02 — NATS connect + JetStream config (config/nats) + NATS_ENABLED guard
- Status: done
- Depends on: F00-T02
- Estimate: 0.5d
- Acceptance:
  - `src/config/nats.ts` connects to NATS and ensures the JetStream stream(s) for the domain subjects exist; connection params come from `config/vars` (`NATS_URL`, `NATS_ENABLED`).
  - When `NATS_ENABLED=false`, no connection is attempted and the module exposes a no-op publisher — importing it never throws and never blocks app boot.
  - Connection failures when enabled are logged and surfaced via `GET /ready` (503), not crashed into the request path.
  - tsc clean; conforms to `docs/04-api/CORE_PATTERNS.md`; ADR-0002 honoured (NATS is the optional live layer).

### F11-T03 — outbox relay (poll unpublished → publish → mark publishedAt; at-least-once)
- Status: done
- Depends on: F11-T01, F11-T02
- Estimate: 0.75d
- Acceptance:
  - A relay (background loop/worker) polls `OutboxEvent WHERE publishedAt IS NULL` ordered by `createdAt`, publishes each to its `subject` via the JetStream publisher, then sets `publishedAt = now()`.
  - Delivery is **at-least-once**: a crash between publish and mark re-publishes on the next poll (consumers are documented as idempotent); a row is never marked published without a successful publish ack.
  - The relay is idempotent to run concurrently-safe enough for a single-instance dev deployment (claims rows it is publishing; does not double-send within one pass).
  - With `NATS_ENABLED=false` the relay loop is inert (no publishing, rows simply accumulate) and never errors.
  - Integration test: insert an unpublished `OutboxEvent`, run one relay pass, assert it is published and `publishedAt` is set.

### F11-T04 — emit domain events (request.created, reservation.held/confirmed, conflict.detected, request.approved, inventory.low)
- Status: done
- Depends on: F11-T03
- Estimate: 0.5d
- Acceptance:
  - The owning mutations write an `OutboxEvent` **in the same transaction** as the state change (alongside the `AuditEntry`), for: `request.created` (F04 create), `reservation.held` + `conflict.detected` (F06 hold), `reservation.confirmed` (F06 confirm / F10 approve), `request.approved` (F10 approve), `inventory.low` (asset availability crossing the threshold).
  - Each event's `payload` carries the minimal useful body; `conflict.detected` carries the `Conflict[]` so the AI can explain without re-querying (per `docs/02-domain/CONFLICTS.md`).
  - No dual-write: there is no path that publishes directly instead of going through the outbox.
  - The subjects exactly match `docs/02-domain/AUDIT.md`'s table (casing + dotted form).
  - Test: performing each mutation leaves exactly one matching `OutboxEvent` row with the correct subject and payload.

### F11-T05 — degrade-to-REST: system fully works with NATS_ENABLED=false
- Status: done
- Depends on: F11-T02
- Estimate: 0.25d
- Acceptance:
  - With `NATS_ENABLED=false`, the full core flow (create request → match → hold → quote → tasks → approve, plus the conflict path) completes successfully over REST with no NATS dependency.
  - `GET /ready` returns 200 with NATS disabled (it does not require a NATS connection in that mode).
  - Outbox rows still get written (so enabling NATS later replays nothing lost), but nothing is published and nothing errors.
  - Test: run the core flow with `NATS_ENABLED=false` and assert every step succeeds and `/ready` is 200.

### F11-T06 — events integration test (outbox → consumer receives)
- Status: done
- Depends on: F11-T04
- Estimate: 0.5d
- Acceptance:
  - End-to-end test (real Postgres + real NATS in CI): perform a mutation (e.g. a hold), let the relay run, and assert a subscribed consumer receives the event on the expected subject with the expected payload.
  - The test exercises at-least-once: a duplicate delivery does not corrupt the consumer's view (idempotent handling).
  - Covers at least `reservation.held` and `conflict.detected` (the two the AI keys off).
  - Runs in CI alongside the other integration tests; tsc clean.

### F11-T07 — Calendar date-nav + remove Week + live bars; Dashboard/SpaceDetail live timelines via useSchedule (XC-1)
- Status: done
- Depends on: F06-T08 , F13-T07
- Estimate: 1d
- Acceptance:
  - Calendar defaults to today; adds prev/next-day + a date picker; the Week toggle (unimplemented) is removed (no dead control).
  - `useSchedule(window)` feeds `reservationsToBars`; Calendar, Dashboard “Live schedule”, and SpaceDetail “Today’s schedule” render REAL reservation bars; `SAMPLE_TIMELINE_LANES` dropped from production paths; “• live” only on live data.
  - Timeline bar hours render in `Europe/Tirana` (isoToDecimalHour fixed); timeline legend localized. tsc + build green.
