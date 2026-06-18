---
id: F06
name: Reservations
last_updated: 2026-06-19
---

# F06 — Tasks

### F06-T01 — Reservation + ReservationAsset models + migration (effectiveStart/End, expiresAt)
- Status: done
- Depends on: F00-T06
- Estimate: 0.25d
- Acceptance:
  - `Reservation` and `ReservationAsset` exist in `ops-core/prisma/schema.prisma` per `docs/03-data/SCHEMA.md`: `Reservation { id, requestId, spaceId, dateRange (Json), effectiveStart (DateTime), effectiveEnd (DateTime), status: ReservationStatus, expiresAt? (DateTime), createdById, createdAt }`, `ReservationAsset { id, reservationId, assetId, quantity (Int) }`.
  - The overlap indexes are present: `Reservation @@index([spaceId, status, effectiveStart, effectiveEnd])` and `@@index([status, effectiveStart, effectiveEnd])`; `ReservationAsset @@index([assetId])`.
  - `ReservationStatus` enum matches `openapi.yaml` (`HELD|CONFIRMED|RELEASED`).
  - If F00-T06 already shipped these complete this is a verification no-op; otherwise a gap-fill migration applies cleanly via `prisma migrate deploy`.

### F06-T02 — atomic hold: serializable tx + row locks, re-validate via detectConflicts, 409 {conflicts}, audit + outbox
- Status: done
- Depends on: F05-T04, F06-T01, F09-T02
- Estimate: 1d
- Acceptance:
  - `POST /private/reservations` validates `ReservationInput` (`requestId`, `spaceId`, `dateRange` with `start < end`, optional `assets[]` each `quantity ≥ 1`, `holdMinutes` default 30) then runs the hold inside a **serializable** `prisma.$transaction` (`src/services/reservation`).
  - Inside the transaction: lock the relevant rows (`SELECT … FOR UPDATE` on the space's overlapping reservations + the asset rows, or a conditional `UPDATE … WHERE available ≥ qty`), re-run `detectConflicts(spaceId, effectiveWindow, requestedAssets)` against the locked state (the availability check and the write are never two separate statements, per `docs/04-api/CORE_PATTERNS.md`).
  - On any conflict: abort the whole transaction and return `APIError` `409 conflict` with `conflicts: Conflict[]` (per `docs/04-api/ERROR_CONTRACT.md`) — nothing half-written.
  - On success: insert the `Reservation` (`HELD`, `expiresAt = now + holdMinutes`, computed `effectiveStart/End` from the space buffers) + `ReservationAsset` rows, and write the `AuditEntry` (`reservation.hold`) + `OutboxEvent` (`reservation.held`, and `conflict.detected` on the failure path) in the same transaction.
  - Returns `ServiceResponse<Reservation>` (201); tsc clean; unit + integration tests pass.

### F06-T03 — idempotency middleware (Redis, 24h, key-mismatch 409) on all mutations
- Status: done
- Depends on: F00-T03
- Estimate: 0.5d
- Acceptance:
  - A `withIdempotency` middleware (Redis-backed, 24h TTL) wraps every mutating route across ops-core; it requires the `Idempotency-Key` header (UUID v4) per `openapi.yaml` and rejects a missing/invalid key.
  - A replay with the same key + same request hash returns the **original** cached response (status + body), never re-executing the mutation (so a retried hold never creates a duplicate reservation).
  - The same key with a **different** request body → `409 idempotency_key_mismatch` per `docs/04-api/ERROR_CONTRACT.md` (ADR-0005).
  - The key + request hash + response are cached for 24h; the cache is keyed per route+key so unrelated routes don't collide.
  - Unit/integration test: double-submit returns one effect + the original body; a body-mismatch replay → `409`.

### F06-T04 — confirm/release transitions (idempotent; invalid → 409)
- Status: done
- Depends on: F06-T02
- Estimate: 0.5d
- Acceptance:
  - `POST /private/reservations/:id/confirm` transitions `HELD → CONFIRMED`, clears `expiresAt`, and writes `AuditEntry` (`reservation.confirm`) + `OutboxEvent` (`reservation.confirmed`) in one transaction; it is **idempotent** (re-confirming a CONFIRMED reservation returns it, no error/duplicate).
  - If the hold already expired before confirm, confirm returns `409 conflict` with the re-detected `Conflict[]` so the AI can re-plan (per `docs/02-domain/RESERVATIONS.md`), rather than confirming a stale hold.
  - `POST /private/reservations/:id/release` transitions to `RELEASED`, returning inventory, idempotent, audited (`reservation.release`).
  - Any illegal move (confirm a `RELEASED`, etc.) → `APIError` `409 invalid_transition` with `from`/`to`.
  - Both require `Idempotency-Key`; an unknown id → `404`; tsc clean; vitest passing.

### F06-T05 — HELD expiry reaper + check-on-read (no inventory leak)
- Status: done
- Depends on: F06-T02
- Estimate: 0.5d
- Acceptance:
  - A reaper job periodically flips `HELD` reservations whose `expiresAt <= now` to `RELEASED` (writing audit), so abandoned holds free their inventory (per `docs/02-domain/RESERVATIONS.md`).
  - A defensive check-on-read: availability queries (F05) only count `HELD` reservations with `expiresAt > now`, so even before the reaper runs a lapsed hold does not block or reduce availability.
  - The reaper is idempotent and safe to run repeatedly; releasing an already-released hold is a no-op.
  - Test: a hold past `expiresAt` no longer reduces `availableQuantity` (check-on-read) and is flipped to `RELEASED` by the reaper; inventory returns to full.

### F06-T06 — concurrency integration test (two parallel holds for one scarce asset → exactly one wins)
- Status: done
- Depends on: F06-T02
- Estimate: 0.5d
- Acceptance:
  - Integration test (real Postgres): seed one asset with a scarce quantity, fire two `POST /private/reservations` in parallel (distinct `Idempotency-Key`s) each requesting more than half the stock so only one can win.
  - Exactly one returns `201` (the reservation) and the other returns `409 conflict` with an `ASSET_OVERALLOCATED` conflict — never both succeed (the serializable tx + row locks kill the TOCTOU race per `docs/02-domain/RESERVATIONS.md`).
  - Post-condition: the summed allocation never exceeds `totalQuantity`; no partial/half-written reservation exists for the loser.
  - The same race is asserted for `SPACE_DOUBLE_BOOKED` (two parallel holds for one space window → one wins).
  - Runs in CI; tsc clean.
