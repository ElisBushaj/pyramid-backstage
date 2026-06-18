---
id: F12
name: Seed & Demo Dataset
last_updated: 2026-06-18
---

# F12 — Tasks

### F12-T01 — seed 4 halls (Blue/Orange/Green/Yellow) + transitional areas with capacities + buffers
- Status: not_started
- Depends on: F02-T01
- Estimate: 0.25d
- Acceptance:
  - The seed creates the four main halls (Blue, Orange, Green, Yellow) on floors 0/−1 with `kind: MAIN`, each carrying a realistic `capacities` layout→int map (THEATER/CLASSROOM/BANQUET/RECEPTION as applicable) per `docs/02-domain/SPACES.md`.
  - It creates the transitional areas (`kind: TRANSITIONAL`) — entrance/corridors/gathering spaces — as bookable spaces.
  - Each space has realistic `setupBufferMinutes`/`teardownBufferMinutes` (so the conflict engine has meaningful buffers to test) and an integer `dayRateMinor`.
  - Re-running after reset reproduces the same spaces deterministically (stable ids); enums + money conform to the contract.

### F12-T02 — seed ~6 asset lines with realistic counts (chairs 400, tables 80, mics 12, screens 6, projectors 6, stage 10)
- Status: not_started
- Depends on: F03-T01
- Estimate: 0.25d
- Acceptance:
  - The seed creates ~6 `Asset` lines with the stated counts: standard chairs 400 (`SEATING`), tables 80 (`TABLE`), microphones 12 (`MICROPHONE`), screens 6 (`SCREEN`), projectors 6 (`PROJECTOR`), stage units 10 (`STAGE_UNIT`).
  - Each has a valid `AssetType`, a `location`, and `status: ACTIVE`; `totalQuantity` is an integer.
  - The counts are large enough that the planted conflict (F12-T04) can over-allocate a scarce line in one window while another window stays satisfiable.
  - Deterministic ids; conforms to `docs/02-domain/ASSETS.md`.

### F12-T03 — seed staff users (one per role: ADMIN/MANAGER/OPS/VIEWER)
- Status: not_started
- Depends on: F01-T02
- Estimate: 0.25d
- Acceptance:
  - The seed creates exactly one `User` per `Role` (ADMIN, MANAGER, OPS, VIEWER) with known, documented email + password, passwords hashed with argon2id (via the F01-T02 helper).
  - These users unblock the RBAC sweep and the e2e flow (e.g. the MANAGER approves in F13-T03); credentials are dev-only.
  - The seed refuses to run when `NODE_ENV=production`.
  - Re-running after reset reproduces the same users deterministically.

### F12-T04 — seed 2-3 events + a DELIBERATE planted conflict + reset script
- Status: not_started
- Depends on: F06-T02
- Estimate: 0.5d
- Acceptance:
  - The seed creates 2–3 `EventRequest`s with reservations such that one pair **deliberately conflicts**: either two events whose effective windows overlap in the same hall (`SPACE_DOUBLE_BOOKED`/`SETUP_WINDOW_OVERLAP`) or two demands that over-allocate a scarce asset line (`ASSET_OVERALLOCATED`) — verified by `detectConflicts`/`POST /reservations` returning a real `409 conflict` (per `docs/02-domain/CONFLICTS.md`).
  - The planted conflict is the fixture A00-T09's conflict branch keys off and F13-T03's conflict→alternatives path exercises (per `docs/02-domain/AI_ORCHESTRATION.md`).
  - A reset script clears domain data and re-seeds to the same deterministic state, making the demo + e2e repeatable.
  - Reservations are created through the real F06 hold path (so they carry valid effective windows + audit/outbox), not raw inserts that bypass invariants, where feasible.
  - The seed/reset refuses `NODE_ENV=production`; tsc clean.
