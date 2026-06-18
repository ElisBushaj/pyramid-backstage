---
id: F12
name: Seed & Demo Dataset
phase: Integration
depends_on: [F02, F03, F04, F06]
status: not_started
last_updated: 2026-06-18
---

# F12 — Seed & Demo Dataset

## Summary

A deterministic, realistic dataset that makes the demo and the e2e tests run green every time: the four halls + transitional areas with real capacities and buffers, the asset inventory at believable counts, one staff user per role, a couple of events, and a **deliberately planted conflict** so the conflict→alternatives story is genuinely exercised (not contrived at runtime). Plus a reset script so the demo can be re-run from a clean slate.

This is the substrate the F13 e2e test and the demo beats stand on; the planted conflict is what the AI's conflict branch (A00-T09) keys off.

## Scope

### In scope
- Seed the four main halls (Blue/Orange/Green/Yellow) + transitional areas with `capacities` per layout and per-space buffers.
- Seed ~6 asset lines at realistic counts (chairs 400, tables 80, mics 12, screens 6, projectors 6, stage units 10).
- Seed one staff user per role (ADMIN/MANAGER/OPS/VIEWER) with known credentials (non-production only).
- Seed 2–3 events plus a deliberate planted conflict, and a reset script.

### Out of scope
- Production data — the seed refuses to run against `NODE_ENV=production`.
- The conflict engine / reservation logic — F05/F06 (seed only creates data that exercises them).
- Frontend fixtures — outside ops-core scope.

## Acceptance criteria

- Running the seed against an empty (or reset) DB creates: 4 main halls + transitional areas with layout→capacity maps and realistic setup/teardown buffers (per `docs/02-domain/SPACES.md`); the asset lines at the stated counts (per `docs/02-domain/ASSETS.md`); one `User` per `Role` with argon2id-hashed known passwords.
- The seed creates 2–3 `EventRequest`s with reservations, and a **planted conflict**: two demands that collide in a space window or over a scarce asset, such that `detectConflicts`/`POST /reservations` returns a real `409 conflict` for the conflicting one (per `docs/02-domain/CONFLICTS.md`).
- A reset script drops/clears domain data and re-seeds to the same deterministic state, so the demo and e2e tests are repeatable.
- The seed is deterministic (stable ids/values) so tests can assert against known entities; it refuses to run when `NODE_ENV=production`.
- The seeded data conforms to the contract shapes (valid enums, integer minor money, RFC-3339 UTC dates) — it loads through the real services/validators, not raw inserts that could bypass invariants where feasible.

## Data model

No new models — F12 populates `Space`, `Asset`, `User`, `EventRequest`, `Reservation`, `ReservationAsset` (and the audit/outbox rows their creation implies). See `docs/03-data/SCHEMA.md`.

## API surface

None — backend (scripts, not endpoints).

## UI surfaces

None — backend.

## Notes

- Space inventory + capacities + buffers: `docs/02-domain/SPACES.md`. Asset counts: `docs/02-domain/ASSETS.md`.
- The planted conflict is the demo's strongest moment and the seed for A00-T09's conflict branch: `docs/02-domain/CONFLICTS.md`, `docs/02-domain/AI_ORCHESTRATION.md`.
- Seed must refuse production (mirrors the marketplace seed-refuses-production discipline).
