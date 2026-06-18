---
id: F06
name: Reservations
phase: Core
depends_on: [F04, F05]
status: not_started
last_updated: 2026-06-18
---

# F06 — Reservations

## Summary

A reservation holds a **space + a set of assets** for a request's window. It is the only place inventory is decremented and the only place a race can corrupt state — so it is transactional, idempotent, and leased. The naive "check then act" flow is a textbook TOCTOU race; this feature kills it by re-validating availability and decrementing **atomically** inside one serializable transaction with row locks, returning `409 { conflicts }` on any clash. Holds carry an `expiresAt`; a reaper (and a defensive check-on-read) releases lapsed holds so inventory never leaks.

This is the single most correctness-critical feature after F05. Its proof is a concurrency integration test: two parallel holds for one scarce asset → exactly one wins.

## Scope

### In scope
- `Reservation` + `ReservationAsset` models (from F00-T06) + migration gap-fill (`effectiveStart/End`, `expiresAt`).
- `POST /private/reservations` — the atomic hold (serializable tx + row locks, re-validate via `detectConflicts`, `409 {conflicts}`, audit + outbox).
- Idempotency middleware (Redis, 24h, key-mismatch → 409) on all mutations.
- `POST /private/reservations/:id/confirm` and `/release` (idempotent transitions; invalid → 409).
- The HELD-expiry reaper + check-on-read (no inventory leak).
- The concurrency integration test.

### Out of scope
- The conflict math — F05 (`detectConflicts` is called here; not reimplemented).
- The approval flow that confirms on approve — F10 (it calls confirm; F06 owns the transition).
- Quotes / tasks built from a reservation — F07/F08.

## Acceptance criteria

- `POST /private/reservations` runs inside a **serializable** `prisma.$transaction`: lock the space's overlapping reservations and the asset rows in play (`SELECT … FOR UPDATE` or a conditional `UPDATE … WHERE available ≥ qty`), re-run `detectConflicts` against the locked state, and on any conflict **abort the whole transaction** returning `409 conflict` with `conflicts: Conflict[]` — nothing half-written (per `docs/02-domain/RESERVATIONS.md`).
- On success it inserts the `Reservation` (`HELD`, `expiresAt = now + holdMinutes` default 30) + its `ReservationAsset` rows, computes `effectiveStart/End` from the space buffers, and writes the `AuditEntry` (`reservation.hold`) + `OutboxEvent` (`reservation.held`) in the same transaction.
- `Idempotency-Key` (UUID v4) is required on every mutation; a replay returns the **original** response (never a duplicate reservation); a body mismatch under the same key → `409 idempotency_key_mismatch` (per `docs/04-api/CORE_PATTERNS.md`, ADR-0005).
- `POST /reservations/:id/confirm` transitions `HELD → CONFIRMED`, clears `expiresAt`, writes audit + outbox (`reservation.confirmed`); it is idempotent; an illegal move (confirm a `RELEASED`) → `409 invalid_transition`; if the hold already expired, confirm returns `409 conflict` with the re-detected `Conflict[]` so the AI can re-plan.
- `POST /reservations/:id/release` returns inventory (`→ RELEASED`), idempotent, audited.
- A reaper job and a check-on-read flip lapsed `HELD` → `RELEASED`; availability queries only count `HELD` reservations whose `expiresAt > now` — abandoned holds never lock inventory forever.
- The concurrency test: two parallel `POST /reservations` for one scarce asset → exactly one `201`, the other `409 conflict`; total allocation never exceeds `totalQuantity`.

## Data model

`Reservation { id, requestId, spaceId, dateRange (JSON {start,end}), effectiveStart, effectiveEnd, status: ReservationStatus, expiresAt?, createdById, createdAt }` and `ReservationAsset { id, reservationId, assetId, quantity }` per `docs/03-data/SCHEMA.md` and the `Reservation`/`ReservedAsset` schemas in `openapi.yaml`. Indexed for overlap queries (F00-T06).

## API surface

- `POST /private/reservations` — hold a space + assets (atomic) → `Reservation` **or** `409 { conflicts }`.
- `POST /private/reservations/:id/confirm` — confirm a held reservation (idempotent) → `Reservation`.
- `POST /private/reservations/:id/release` — release back to inventory → `Reservation`.

## UI surfaces

None — backend.

## Notes

- The race and the serializable-transaction fix, leases, idempotency, confirm semantics: `docs/02-domain/RESERVATIONS.md`.
- The authoritative check is F05's `detectConflicts` run inside the transaction (`docs/02-domain/CONFLICTS.md`).
- Idempotency: ADR-0005 + `docs/04-api/CORE_PATTERNS.md`. Conflict error body: `docs/04-api/ERROR_CONTRACT.md`.
