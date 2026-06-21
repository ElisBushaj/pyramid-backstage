# ADR-0016: A reservations-by-window read endpoint feeds the live timelines

- **Status**: Accepted
- **Date**: 2026-06-21

## Context

The product's headline promise is *"can we make this happen / what's next."* The surfaces that answer it visually are the **Dashboard "Live schedule," the Calendar day view, and the SpaceDetail "Today's schedule"** — all rendered by the shared `AvailabilityTimeline`, which draws per-reservation **bars** (a space lane × a `[start, end]` window × a status).

The frontend audit found all three render **fabricated or empty** data while labelled "• live": the Dashboard falls back to `SAMPLE_TIMELINE_LANES`, the Calendar grafts those samples onto any space the contract reports busy, and SpaceDetail hardcodes `reservations: []` (always "free"). A real adapter, `reservationsToBars`, already exists in the frontend but is dead code.

The root cause is a **contract gap**: nothing exposes per-reservation time windows for a range.
- `GET /private/spaces?start&end` annotates each space with only a boolean `available` (`SpaceWithAvailability`) — no windows.
- `GET /private/spaces/:id/availability` returns `{ available, conflictingRequestIds }` — still no `start`/`end` bars.
- `/private/reservations` is **POST-only** (hold); there is no list-by-window read.

So the timeline literally has no live data source. The availability engine already *selects* the reservation rows it needs (`overlappingSpaceReservations` reads `requestId/start/end`) but discards everything except the boolean.

## Decision

**Add an additive read endpoint `GET /private/reservations?start&end[&spaceId][&status]` returning the reservation windows in the range, shaped to drive `reservationsToBars`.**

- **Route / tier**: `GET /api/v1/private/reservations`, `requireAuth` (any staff role; partners are row-scoped by ownership exactly as the rest of their reads, [ADR-0010](./0010-partner-role-and-approval-chain.md)). Read-only — no transaction semantics beyond a consistent snapshot.
- **Query**: `start` + `end` (ISO, required, `start < end`, bounded span); optional `spaceId`; optional `status` (`HELD | CONFIRMED`, default both). Validated with `ValidationHelpers` + `express-validator`.
- **Selection**: a reservation overlaps the window when `start < end_q AND end > start_q` (half-open, via `utils/time.ts` — no hand-rolled interval math). Buffers (`setupBufferMinutes`/`teardownBufferMinutes`) are returned as fields so the client can shade the setup/teardown band, matching the timeline legend.
- **Shape** (`ScheduleEntry` DTO, new `src/types/api/reservations.ts` addition): `id, spaceId, requestId, status, start, end, setupBufferMinutes, teardownBufferMinutes` and a denormalised `requestTitle` + `attendees` for the lane sublabel (the timeline shows "Title · N"). Returned as a plain list (`ServiceResponse<ScheduleEntry[]>`); bounded by the window, so no pagination.
- **Contract**: new `openapi.yaml` path + `ScheduleEntry` schema (with `example`), DTO in `ops-core/src/types/api/reservations.ts`, hand-mirrored in `frontend/src/api/types/reservations.ts`; contract + integration tests (real Postgres) green.
- **Frontend**: a `useSchedule(window)` hook feeds `reservationsToBars`; Dashboard / Calendar / SpaceDetail consume it and drop the `SAMPLE_TIMELINE_LANES` graft and the hardcoded `[]`. The "• live" badge only paints genuinely live data.

## Consequences

- **The flagship surfaces become truthful.** The three "live" timelines render real reservations; the dead `reservationsToBars` adapter goes live; the sample lanes survive only as a Storybook/empty-state default.
- **Additive and lane-rule-safe.** A new read path + schema breaks nothing and needs no AI work — the AI orchestrator (Alvin's lane) is untouched. The frontend mirrors the new DTO per [TYPE_SHARING.md](../04-api/TYPE_SHARING.md).
- **One endpoint, three consumers.** A single windowed read serves Dashboard (today, all spaces), Calendar (a day, all spaces), and SpaceDetail (today, one space via `spaceId`) — no per-surface backend.
- **Reuses the availability engine's existing read.** The rows are already fetched for conflict detection; this endpoint exposes them instead of throwing them away, so there is no new query strategy or index to reason about.
- **Timezone.** Windows are ISO-Z instants; the client pins rendering to `Europe/Tirana` (paired frontend `lib/time` work) so bar positions are venue-stable.

## Alternatives considered

- **Embed `reservations[]` on `GET /private/spaces?start&end`.** Rejected: it overloads the catalog list (fetched in many places that don't want windows), bloats every spaces response, and couples the timeline to the spaces pagination. A dedicated reservations read is cohesive and independently cacheable.
- **Enrich `GET /spaces/:id/availability` with windows.** Rejected for the multi-space surfaces (Dashboard/Calendar need *all* spaces in one call); it would force an N-call fan-out. The single windowed list is one request for the whole day. (`/availability` stays as the per-space boolean it is.)
- **Keep the samples but relabel "preview."** Rejected as the end state: honest, but it leaves the product's headline answer ("what's on today?") permanently fake. Acceptable only as the interim until this endpoint ships.
- **Derive bars client-side from `/conflicts`.** Rejected: conflicts are the *exception* set, not the schedule; most reservations aren't conflicts, so the timeline would be near-empty.
