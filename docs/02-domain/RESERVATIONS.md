# Domain — Reservations (atomicity & leases)

A reservation holds a **space + a set of assets** for a request's window. It is the only place inventory is decremented, and the only place a race can corrupt state — so it is transactional, idempotent, and leased.

## Lifecycle
```
HELD ──confirm──► CONFIRMED
  │                   │
  └──release──┐       └──release──► RELEASED
  └──expire───┴──► RELEASED   (reaper, when expiresAt passes)
```
Illegal moves (confirm a `RELEASED`, etc.) → `409 invalid_transition`.

## The race, and how we kill it
The naive flow — `GET /assets` (check) then `POST /reservations` (act) — is a textbook TOCTOU race: between check and act, another request grabs the same scarcity. With "multiple events simultaneously" and "shared assets" as explicit constraints, this is the #1 correctness risk.

**Fix: the write re-validates and decrements atomically.** `POST /reservations` does *not* trust the earlier availability read. Inside a single **serializable** Prisma transaction:

1. Lock the relevant rows (`SELECT … FOR UPDATE` on the space's overlapping reservations and the asset rows in play).
2. Re-run `detectConflicts(space, effectiveWindow, requestedAssets)` against the locked state.
3. If any conflict → **abort the whole transaction**, return `409 { conflicts }`. Nothing is half-written.
4. Else insert the `Reservation` (`HELD`, `expiresAt = now + holdMinutes`) + its `ReservationAsset` rows, write the `AuditEntry`, commit.

Because the conflict check and the insert share one serializable transaction with row locks, two concurrent holds for the same scarce asset cannot both succeed — exactly one wins, the other gets `409`. This is verified by a concurrency integration test (two parallel `POST /reservations`).

## Leases (no inventory leak)
A `HELD` reservation decrements availability immediately (a hold you can't see isn't a hold). But an abandoned hold must not lock inventory forever:
- `expiresAt = createdAt + holdMinutes` (default 30).
- A reaper job (and a defensive check-on-read) flips lapsed `HELD` → `RELEASED`.
- Availability queries only count `HELD` reservations whose `expiresAt > now`.

## Idempotency
`POST /reservations`, `/confirm`, `/release` all require `Idempotency-Key`. A retried hold (network blip, double-click) returns the **original** reservation, never a duplicate. The key + request hash + response are cached 24h.

## Confirm
`POST /reservations/:id/confirm` (used by the approval flow) transitions `HELD → CONFIRMED`, clears `expiresAt`, writes audit. Idempotent. If the hold already expired, confirm returns `409 conflict` with the re-detected `Conflict[]` so the AI can re-plan rather than confirm a stale hold.
