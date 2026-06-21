# Resolved Questions

Decisions made — the audit trail of *why* the project is shaped the way it is. Each entry keeps its original question context and adds a **Resolution** + **Rationale**. Append-only; never delete. Most resolutions point to an ADR in [`docs/08-decisions/`](../08-decisions/) where the full reasoning lives.

## Format

```
### R-NN — Title
- Resolved: YYYY-MM-DD
- Resolution: <the decision>
- Rationale: <why; what it trades off>
- See: ADR-#### (if applicable)
```

---

### R-01 — Where does staff auth + RBAC live?
- Resolved: 2026-06-18
- Resolution: **Session auth (argon2id + httpOnly signed cookie + server-side sessions) and RBAC (`ADMIN/MANAGER/OPS/VIEWER`) are owned by `ops-core`.** Approvals require MANAGER+, inventory writes OPS+, user management ADMIN. `ai-orchestrator` forwards staff identity; it never holds credentials.
- Rationale: The audit ledger needs a real decider, so auth is a hard dependency — and auth is *state*, so it belongs in the record, not a separate service. For an internal staff tool with four roles and no public signup, self-hosting the minimal version is lighter than SuperTokens (no fourth container) and faster to make flawless in three days.
- See: [ADR-0003](../08-decisions/0003-session-auth-rbac-in-ops-core.md)

### R-02 — Do we adopt a real-time event bus?
- Resolved: 2026-06-18
- **Superseded: 2026-06-21 — the async event subsystem was removed entirely ([ADR-0018]).** NATS/JetStream, the transactional outbox, the relay, and the published domain subjects are gone. Mutations now write state + an `AuditEntry` only, and the dashboard gets freshness by **polling the REST contract**. The text below is retained as historical record.
- Resolution (historical): **Yes — NATS (JetStream), written via a transactional outbox, and degradable.** Ran `ops-core` REST-only with a polling dashboard fallback.
- Rationale (historical): The live command center and the unprompted AI heads-up were treated as wow moments needing a live fan-out. The outbox killed the dual-write hazard. Degradability kept correctness independent of the bus: the whole loop worked without it — which is why removing the bus left the core loop intact.
- See: [ADR-0018]

### R-03 — How is money represented, and what is the VAT posture?
- Resolved: 2026-06-18
- Resolution: **All money is integer minor units (`ALL`, factor 1); `Quote.totalMinor` is server-computed = `net + round(net × 0.20)` VAT; clients never send totals.** No float ever touches money.
- Rationale: Float currency arithmetic is wrong eventually, and client-supplied totals let the displayed total disagree with the line items (the PDF sketch's exact bug). Server-side integer math with one explicit VAT round is exact, auditable, and internally consistent. 20% is the Albanian standard VAT (the real rate card is Q-03).
- See: [ADR-0004](../08-decisions/0004-money-integer-minor-units-vat.md)

### R-04 — Is `ai-orchestrator` (Alvin's service) built in the 3 days?
- Resolved: 2026-06-18
- Resolution: **No.** `ops-core` (Elis, F00–F13) ships in full over the 3 days. `ai-orchestrator` is **scaffold + stateful mock + reference backlog (`docs/06-features/A00`) only** in this repo; Alvin implements the LangGraph / RAG / copilot logic on his own timeline.
- Rationale: The contract-only split ([ADR-0001](../08-decisions/0001-two-services-one-contract.md)) lets the two services be built independently. The deterministic record is the hard, must-be-correct half and the right thing to ship complete; the reasoning layer develops against `mock-ops-core` and integrates by flipping `OPS_CORE_URL`. `A00` tasks are explicitly out of the ops-core agent loop's eligibility (the lane rule in `CLAUDE.md`).
- See: [ADR-0001](../08-decisions/0001-two-services-one-contract.md), [docs/02-domain/AI_ORCHESTRATION.md](../02-domain/AI_ORCHESTRATION.md)

### R-05 — What is the visual language?
- Resolved: 2026-06-18
- Resolution: **Near-monochrome with a single calm-blue accent, light-first.** Color appears only to encode operational status (conflict / held / confirmed / scheduled); a screen with no problems is almost colorless. Built with Tailwind 4 (CSS-var tokens) + Radix + an owned CVA component layer.
- Rationale: The Pyramid team is non-technical and under time pressure; the tool replaces email/Excel chaos, so it must feel instantly legible, trustworthy, and quiet — the reference is Apple's pro tools / Linear / Things, not a colorful SaaS dashboard. Token-driven styling makes the design-export parity check exact. Dark mode is deferred (vars-on-`:root` keep it a values-only future change).
- See: [ADR-0007](../08-decisions/0007-tailwind-radix.md), [docs/05-frontend/DESIGN_SYSTEM.md](../05-frontend/DESIGN_SYSTEM.md)

### R-06 — How does `ai-orchestrator` authenticate to `ops-core`?
- Resolved: 2026-06-20
- Resolution: **A service token (a system actor), plus forwarded acting-user headers `X-Acting-User-Id` / `X-Acting-User-Role` with a forwarded-role ceiling.** The AI authenticates as itself; it *acts on behalf of* the staff/partner user it forwards, so audit entries name the real actor and partner row-scoping ([R-08](#r-08--partner-role-and-the-approval-chain)) stays correct. The ceiling caps the effective role at the forwarded role — the AI can never escalate past the user driving it.
- Rationale: Session cookies are browser-bound and carry no notion of "service X acting for user Y"; minting staff cookies for the AI would forge identity and break the audit trail. A service token keeps the AI a first-class, distinct principal (the existing `writeSystemAudit(actorId=null)` reaper proves the system-actor path), while forwarded actor headers preserve the *human* decider in every mutation. The role ceiling is the safety rail: a forwarded PARTNER can never become a MANAGER mid-call. This is the only new auth path; the session-cookie path is untouched.
- See: [ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md), [docs/04-api/AI_CONTRACT.md](../04-api/AI_CONTRACT.md)

### R-07 — QR / NFC asset tracking: aggregate-with-movement
- Resolved: 2026-06-20
- Resolution: **Aggregate-with-movement, not per-unit serialized identity.** QR/NFC encodes the `assetId`. `POST /private/assets/:id/scan` appends an `AssetMovement` ledger row and updates the live `Asset.location`; `GET /private/assets/:id/movements` reads the history. The aggregate count model (`totalQuantity`, `availableQuantity = total − Σ overlapping holds`) is unchanged — F16 layers movement on top.
- Rationale: Aggregate-with-movement answers the venue's real question — "where is this *kind* of asset, and what moved when" — and powers the scanner loop and the "where is it" dashboard widget, without the weight of a per-unit `AssetUnit` entity, unit-bound scans, and unit-vs-aggregate reconciliation. `location` was already a first-class field, so the ledger slots in cleanly and additively. Resolves [Q-06](./OPEN.md#q-06--per-unit--qr-asset-tracking-vs-aggregate-counts); per-unit identity is split out as the deferred [Q-09](./OPEN.md#q-09--per-unit-serialized-asset-identity).
- See: [ADR-0011](../08-decisions/0011-qr-nfc-asset-tracking.md), [docs/02-domain/ASSET_TRACKING.md](../02-domain/ASSET_TRACKING.md)

### R-08 — Partner role and the approval chain
- Resolved: 2026-06-20
- Resolution: **Add a `PARTNER` role below VIEWER (rank PARTNER < VIEWER < OPS < MANAGER < ADMIN), with partner-scoped intake and a single-step admin approval queue that removes email.** Partners see only their own rows (scoped by `EventRequest.createdById`); their requests land in the *existing* F10 queue where a MANAGER+ approves or rejects in one step. No new approval state machine.
- Rationale: The partner portal's whole point is to delete the email/phone intake chaos — external organizers self-serve, staff decide in-app. Reusing F10's single-step approve→SCHEDULED / reject→RELEASED keeps the state machine and audit trail unchanged; the only new surface is the `PARTNER` role and the `createdById` row filter (the column already exists; `requestsService.list` just starts honoring it). Resolves the partner/approval half of [Q-02](./OPEN.md#q-02--real-staff-roles-and-who-can-approve); multi-stage approval is split out as the deferred [Q-08](./OPEN.md#q-08--multi-stage-approval-chain). Staff role names and who-approves remain open under Q-02.
- See: [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md), [docs/02-domain/PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md)

### R-09 — Where does the space catalog live, and how do its extension fields ship?
- Resolved: 2026-06-20
- Resolution: **The 19-space catalog lives on `main` at [`docs/03-data/spaces.catalog.json`](../03-data/spaces.catalog.json) as the single shared source, and its extension fields ship additively.** Rows 1–6 are authoritative (exact ops-core seed UUIDs / capacities / rates / buffers); rows 7–19 are new with estimated attrs. F14 adds `slug` / `category` / `zone` / `isCirculation` / `adjacent[]` / `map` / `ceilingCm` to the `Space` model **nullable + backfilled** — no destructive migration, contract additive-only.
- Rationale: One catalog file on `main` is the shared truth both lanes read, so the FloorMap, bundle templates, and the planner reason over the same venue without a new contract endpoint. Making the new columns nullable-and-backfill keeps the migration safe over the existing seed (the F12 planted Blue-hall conflict and the exact UUIDs survive untouched). The estimated rows 7–19 numbers want venue confirmation — split out as the deferred [Q-10](./OPEN.md#q-10--catalog-rows-719-estimated-capacities-rates-and-buffers).
- See: [ADR-0013](../08-decisions/0013-space-catalog-extension-fields.md), [docs/03-data/spaces.catalog.json](../03-data/spaces.catalog.json)

### R-10 — FloorMap ownership and fidelity
- Resolved: 2026-06-20
- Resolution: **Elis builds the v1 radial map; it is a hot-swap target for Alvin later.** v1 is a schematic radial/ring rendering driven by each space's `map {floor, ring, sectorFrom?, sectorTo?}` field, behind a fixed prop contract `<FloorMap floor spaces={[{slug,status}]} />` (status ∈ free | main | bundle | conflict | circulation). It renders `/plan` output as a self-sufficient fallback — the demo never depends on the AI being live.
- Rationale: A correct schematic map ships now and stands alone; pinning the prop contract makes the renderer a clean seam, so Alvin (or a v2) can swap the internals without touching callers. **v2** — tracing the real architectural plan into true SVG polygon hotspots — needs the venue's floor plans and is post-demo polish, split out as the deferred [Q-11](./OPEN.md#q-11--floormap-v2-real-plan-polygon-fidelity). Same prop contract, so v2 is a renderer swap behind the same interface.
- See: [ADR-0014](../08-decisions/0014-floor-map-ownership-and-fidelity-tiers.md), [docs/05-frontend/FLOOR_MAP.md](../05-frontend/FLOOR_MAP.md)
