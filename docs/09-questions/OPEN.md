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
- Status: in_review
- Default if not answered: roles **ADMIN / MANAGER / OPS / VIEWER**; **approvals require MANAGER+**, inventory/space writes require **OPS+**, user management is **ADMIN** ([ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)).
- Context: The audit ledger is worthless without a real decider, so RBAC is in scope. The four-role ladder maps to venue-manager / logistics / front-desk and is the minimal credible model. We need the venue's real org chart to confirm role names and, critically, **who is allowed to approve** an event (commit reservations + money). The default is conservative (only MANAGER+ approves); widening or renaming is a config change, not a rebuild.
- Update (2026-06-20): the **role ladder is extended below VIEWER with `PARTNER`** (external organizers) and the **approval chain is single-step (reuse F10's MANAGER+ approve/reject)** — see [R-08](./RESOLVED.md#r-08--partner-role-and-the-approval-chain) / [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md). The *staff* names ADMIN/MANAGER/OPS/VIEWER and who-approves are still pending the venue org chart, so this stays `in_review`, not resolved. **Multi-stage approval** (e.g. OPS pre-check → MANAGER sign-off) is split out as [Q-08](#q-08--multi-stage-approval-chain).

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
- Resolved: 2026-06-20 → see [R-07](./RESOLVED.md#r-07--qr--nfc-asset-tracking-aggregate-with-movement)
- Blocks: none — F03 tracks aggregate counts; per-unit is a future extension
- Status: resolved
- Default if not answered: **aggregate counts** per asset line (`totalQuantity`) + a `location` string. No per-physical-unit identity, no QR/NFC tags, no movement ledger.
- Resolution: **aggregate-with-movement.** QR/NFC encodes `assetId` (not a per-unit serial); a scan records an `AssetMovement` ledger row and updates the live `Asset.location`. The aggregate count model is unchanged — F16 layers a movement history on top, no per-physical-unit identity. **Per-unit / serialized identity is split out as the deferred [Q-09](#q-09--per-unit-serialized-asset-identity).** See [ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md).
- Context: Inventory is tracked as a count per asset (400 standard chairs at "Storage -1"), which is enough to compute `availableQuantity = total − Σ overlapping holds` and to drive the conflict engine. Per-unit tracking (each chair a tagged entity with a scan history) is a real-world extension the venue may want eventually; `location` is already a first-class field so the ledger slots in later. Confirm whether aggregate counts suffice for launch — the build assumes they do.

### Q-07 — Realtime expectation: is the live dashboard required, or is polling acceptable?
- Asked: 2026-06-18
- Blocks: none
- Status: closed — moot (the async event subsystem was removed, [ADR-0018], 2026-06-21)
- Note: The whole async event subsystem (NATS/JetStream, the transactional outbox, the relay, published subjects) was removed on 2026-06-21 ([ADR-0018]). The dashboard now gets freshness by **polling the REST contract** — there is no live push layer. This question is retained as historical record only; the polling answer is now the design, not a fallback.
- Context: The live command center and the unprompted AI conflict heads-up were originally going to ride a live event bus. The entire request→plan→approve loop works over REST alone, and the dashboard polls cleanly — which is now the sole freshness mechanism. Correctness never depended on the bus; only the (former) liveness did.

### Q-08 — Multi-stage approval chain
- Asked: 2026-06-20
- Blocks: none — F15 ships single-step approval (reuses F10)
- Status: open
- Default if not answered: **single-step approval** — one MANAGER+ approve/reject transitions the request, exactly as F10 already does ([ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md)). No OPS pre-check stage, no parallel sign-offs, no per-amount escalation.
- Context: The partner portal ([Q-02](#q-02--real-staff-roles-and-who-can-approve) → [R-08](./RESOLVED.md#r-08--partner-role-and-the-approval-chain)) routes external intake into the *existing* approval queue, so launch needs no new state machine. A real venue may eventually want a chain — front-desk OPS triage → MANAGER commit, or finance escalation above a money threshold. That expands the `EventRequest` status machine and the audit trail; it is deliberately deferred so single-step ships clean. If the venue requires staged sign-off for launch, it's a scoped addition to F10/F15, flagged here so it isn't a surprise.

### Q-09 — Per-unit / serialized asset identity
- Asked: 2026-06-20
- Blocks: none — F16 ships aggregate-with-movement
- Status: open
- Default if not answered: **no per-unit identity.** QR/NFC encodes `assetId`; a scan moves the *aggregate* line and appends an `AssetMovement` row. No serial per physical chair, no per-unit scan history, no per-unit lifecycle (lost / damaged / retired) ([ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md)).
- Context: Split from the now-resolved [Q-06](#q-06--per-unit--qr-asset-tracking-vs-aggregate-counts) (→ [R-07](./RESOLVED.md#r-07--qr--nfc-asset-tracking-aggregate-with-movement)). Aggregate-with-movement answers "where is this *kind* of asset, and what moved when" — enough for the "where is it" dashboard widget and the scanner loop. True per-unit tracking (each chair its own tagged entity with an independent location and condition history) is a heavier model: a new `AssetUnit` entity, scans bound to units not types, and a reconciliation story between unit counts and the aggregate `totalQuantity`. Deferred unless the venue needs individual-asset accountability (high-value gear — a specific projector, a named console) at launch.

### Q-10 — Catalog rows 7–19: estimated capacities, rates, and buffers
- Asked: 2026-06-20
- Blocks: none — F14 seeds rows 7–19 from estimates; rows 1–6 are authoritative
- Status: open
- Default if not answered: rows **1–6 are AUTHORITATIVE** (they match the ops-core seed UUIDs, capacities, rates, and buffers exactly); rows **7–19 ship with estimated** capacities / `dayRateMinor` / setup-teardown buffers, marked as estimates, pending venue confirmation. See [`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json) and [ADR-0013](../08-decisions/0013-space-catalog-extension-fields.md).
- Context: The 19-space catalog is a superset of the 6 currently-seeded halls/boxes. Rows 7–19 — the transitional spaces (corridors, atria, the entrance, the terrace) and the additional halls/boxes — carry **estimated** attributes so the FloorMap ([F19](../06-features/F19-floor-map/SPEC.md)), bundle templates, and the planner have a complete venue to reason over. The catalog-extension fields (`slug`, `category`, `zone`, `isCirculation`, `adjacent[]`, `map`, `ceilingCm`) are structural and stable; the *numbers* (how many people fit the south corridor, the terrace day-rate, real turnaround on the atrium) want measurement against the real building. Quotes and conflict windows for rows 7–19 are only as good as these estimates until the venue confirms them.

### Q-11 — FloorMap v2: real-plan polygon fidelity
- Asked: 2026-06-20
- Blocks: none — F19 ships the v1 radial map
- Status: open
- Default if not answered: **v1 radial map** — Elis builds a schematic radial/ring rendering driven by each space's `map {floor, ring, sectorFrom?, sectorTo?}` field, behind the `<FloorMap floor spaces={[{slug,status}]} />` prop contract ([ADR-0014](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md)). No surveyed geometry.
- Context: The v1 map is a correct, legible *schematic* — concentric floors, radial sectors, circulation/center spaces drawn without a sector wedge — enough to render `/plan` output (free / main / bundle / conflict / circulation) and to land the "see the plan on the building" moment. **v2** traces the real architectural plan into true SVG polygon hotspots per space, so the map matches the actual Pyramid footprint rather than an idealized ring. That needs the venue's floor plans (or a survey) and is post-demo polish; the prop contract is identical, so v2 is a renderer swap behind the same interface. Deferred until the real plans are in hand.

### Q-12 — Partner-created request initial status (DRAFT vs PROPOSED)
- Asked: 2026-06-20
- Blocks: none — F15 ships with PARTNER creates landing PROPOSED
- Status: open
- Default if not answered: a **PARTNER** `POST /private/requests` lands at **PROPOSED** (staff still land DRAFT). Per the F15 SPEC acceptance criteria ("created at `PROPOSED` with `createdById = req.actor.id`", stated three times), PARTNER_PORTAL.md ("Request lands `DRAFT → PROPOSED`"), and [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md) (a partner request "enters the *same* queue" — the manager queue of PROPOSED requests).
- Context: `requestsService.create` previously hardcoded `DRAFT` for every actor. A PARTNER cannot place a reservation hold (the `/private/reservations` route is staff-only), and the DRAFT→PROPOSED transition is driven *by* placing a hold — so a DRAFT partner request was a dead-end the approval queue never surfaced and a manager could never approve, breaking the documented partner flow. Fixed in `ops-core/src/modules/requests/service.ts` so PARTNER creates land PROPOSED.
- **Reconciliation needed (downstream artifacts encoding the old DRAFT assumption, both out of the requests-module scope):**
  1. `ops-core/src/scripts/seed.ts` — the E3 partner request is now genuinely **PROPOSED**, but the trailing `console.log` still says "E3 DRAFT by PARTNER". Update the log/narrative (cosmetic; `seed.test.ts` does not assert E3's status, so it stays green).
  2. `ops-core/src/__tests__/dashboard.test.ts:14` — `pendingApprovals.value` is asserted `=== 1` ("E2 PROPOSED"). With the fix the seed now has **two** PROPOSED requests (E2 staff-held + E3 partner-submitted), and `pendingApprovals = count(status='PROPOSED')` is the manager approval queue — so the SPEC-correct value is now **2** (E3 *should* await a manager, that is the whole point of the portal). The dashboard owner should bump the expectation to 2, or this default must be overridden. Flagged, not edited (file outside requests scope).

### Q-13 — Quote with no resolvable reservation (empty zero-quote vs 404)
- Asked: 2026-06-20
- Blocks: none — F07 ships rejecting a quote that has no reservation to price
- Status: open
- Default if not answered: `POST /private/quotes` for a request with **no resolvable reservation** (no `reservationId` given *and* no `HELD|CONFIRMED` reservation for the request) returns **404 `not_found` (`common.not_found`)**, the same shape as an unknown `reservationId`. Previously `quotesService.generate` produced a silent **net=0 / total=0 quote with no line items** in this case.
- Context: QUOTES.md frames a quote as pricing "a request + **its reservation**", and F07-T03 mandates a 404 for an unknown `reservationId`; an *implicitly* missing reservation should not silently yield a zero-value financial document (a quote generated after a hold expired or was released would read "0 ALL" with no signal — a money-correctness trap). The previous behavior threw nothing and persisted a meaningless DRAFT. Fixed in `ops-core/src/modules/quotes/service.ts`: if no reservation resolves, throw `APIError.notFound()`. If the venue instead wants a "space-less / services-only" quote (extraLineItems with no reservation) to be valid, this default should be overridden to allow a quote when `extraLineItems` are present.
