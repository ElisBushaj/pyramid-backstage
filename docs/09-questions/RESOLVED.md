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
- Resolution: **Yes — NATS (JetStream), written via a transactional outbox, and degradable.** `NATS_ENABLED=false` runs `ops-core` REST-only with a polling dashboard fallback.
- Rationale: The live command center and the unprompted `conflict.detected` AI heads-up are core wow moments and need a live fan-out — so we diverge from the marketplace's BullMQ-no-NATS choice. The outbox kills the dual-write hazard (no lost/phantom events). Degradability keeps correctness independent of the bus: the whole loop works without it.
- See: [ADR-0002](../08-decisions/0002-nats-jetstream-event-bus.md)

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
