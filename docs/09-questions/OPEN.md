# Open Questions

Questions for the Pyramid / AADF team that need an answer to be acted on definitively. Each carries a **sensible default-if-no-answer** so the 3-day build proceeds without blocking — the defaults are logged in [`.planning/ASSUMPTIONS.md`](../../.planning/ASSUMPTIONS.md) and, where they became decisions this session, in [`RESOLVED.md`](./RESOLVED.md).

## Format

```
### Q-NN — Title
- Asked: YYYY-MM-DD
- Blocks: F##, F## (or "none — has a working default")
- Status: open | in_review
- Default if not answered: <the fallback the implementer will use>
- Context: <why this matters>
```

When resolved, move the entry to [`RESOLVED.md`](./RESOLVED.md) with an `R-NN` ID and a `Resolution:` line. Don't delete — the resolved log is the audit trail.

---

### Q-01 — Setup / teardown buffer times per space
- Asked: 2026-06-18
- Blocks: none — F05/F09 proceed on the default; only the *values* are in question, not the model
- Status: open
- Default if not answered: **240 min setup / 120 min teardown**, per space, overridable. Buffers feed the effective-window conflict engine ([ADR-0009](../08-decisions/0009-conflict-window-includes-buffers.md)).
- Context: A room is not free the instant an event ends — crews need turnaround time, and that padding is what makes back-to-back bookings surface as `SETUP_WINDOW_OVERLAP` instead of physically colliding. The brief's example task used `dueOffsetHours: -4`; real venues run multi-hour turnarounds. The numbers want a real answer from operations (and may differ per hall vs. transitional area), but the *model* (per-space `setupBufferMinutes`/`teardownBufferMinutes`) ships now.

### Q-02 — Real staff roles, and who can approve
- Asked: 2026-06-18
- Blocks: none — F01 ships on the default ladder
- Status: open
- Default if not answered: roles **ADMIN / MANAGER / OPS / VIEWER**; **approvals require MANAGER+**, inventory/space writes require **OPS+**, user management is **ADMIN** ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)).
- Context: The audit ledger is worthless without a real decider, so RBAC is in scope. The four-role ladder maps to venue-manager / logistics / front-desk and is the minimal credible model. We need the venue's real org chart to confirm role names and, critically, **who is allowed to approve** an event (commit reservations + money). The default is conservative (only MANAGER+ approves); widening or renaming is a config change, not a rebuild.

### Q-03 — Real rate card for spaces and assets
- Asked: 2026-06-18
- Blocks: none — F07 quotes compute on the default rate model
- Status: open
- Default if not answered: **space day-rate only** (`Space.dayRateMinor`), **assets free** (0 unless a rate is set), **VAT 20%** ([ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)). All money integer minor units, `ALL`.
- Context: A quote is `space day-rate × days + reserved assets (at their rate) + optional SERVICE line items`, then `+ 20% VAT`, server-computed. We need the venue's actual price list: per-space day rates (and whether half-day/hourly exists), which assets are chargeable and at what unit price, and confirmation of the 20% VAT rate. The math is rate-card-agnostic — only the seeded numbers change when the real card lands.

### Q-04 — GDPR posture for organizer contact PII
- Asked: 2026-06-18
- Blocks: none — F04 stores the fields; only the data-handling policy is open
- Status: open
- Default if not answered: **store** `contactEmail` / `contactPhone` on the request, surface a *"we handle your contact details responsibly"* notice, **no export/erasure endpoint yet**.
- Context: Event requests carry organizer contact PII. For an internal staff tool with a closed user set this is low-exposure, but the venue should confirm its retention and lawful-basis posture and whether a data-subject export/erasure flow is required for launch. The fields are first-class on `EventRequest`, so adding an export endpoint later is additive. We are **not** building a full DSAR pipeline in the 3 days unless the venue requires it.

### Q-05 — Multi-space events (spilling into corridors)
- Asked: 2026-06-18
- Blocks: none — the build models single-space; multi-space is a noted extension
- Status: open
- Default if not answered: **single-space reservation** per request for the 3-day build. Transitional areas (entrance, corridors) exist as bookable `Space`s, but one reservation holds one space.
- Context: The brief's "think beyond booking" hints at events that spill into transitional areas — a conference using a hall *and* an adjacent corridor for registration. Modeling a single reservation spanning multiple spaces (or linked reservations) is a clean extension but expands the conflict engine and the quote. For the build, a request reserves one space; a second space is a second reservation. If the venue needs true multi-space-per-event now, it's a scoped addition to F05/F06/F07 — flagged so it isn't a surprise.

### Q-06 — Per-unit / QR asset tracking vs. aggregate counts
- Asked: 2026-06-18
- Blocks: none — F03 tracks aggregate counts; per-unit is a future extension
- Status: open
- Default if not answered: **aggregate counts** per asset line (`totalQuantity`) + a `location` string. No per-physical-unit identity, no QR/NFC tags, no movement ledger.
- Context: Inventory is tracked as a count per asset (400 standard chairs at "Storage -1"), which is enough to compute `availableQuantity = total − Σ overlapping holds` and to drive the conflict engine. Per-unit tracking (each chair a tagged entity with a scan history) is a real-world extension the venue may want eventually; `location` is already a first-class field so the ledger slots in later. Confirm whether aggregate counts suffice for launch — the build assumes they do.

### Q-07 — Realtime expectation: is the live dashboard required, or is polling acceptable?
- Asked: 2026-06-18
- Blocks: none — NATS ships with a polling fallback either way
- Status: open
- Default if not answered: **NATS live dashboard, with polling fallback** (`NATS_ENABLED=false` → REST-only) ([ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)).
- Context: The live command center and the unprompted AI conflict heads-up are core "wow" moments, and they ride NATS (`conflict.detected`, `reservation.held`, …). But the entire request→plan→approve loop works over REST alone, and the dashboard degrades to polling cleanly. We'd like to know the venue's real-time expectation — if "the screen updates by itself" is a must-have, NATS stays in the demo path; if polling-on-refresh is acceptable for launch, the degrade mode is the floor. Correctness never depends on the answer; only the liveness does.
