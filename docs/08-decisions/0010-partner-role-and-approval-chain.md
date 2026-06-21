# ADR-0010: PARTNER role and a single-step approval chain

- **Status**: Accepted
- **Date**: 2026-06-20

## Context

The AADF brief replaces the email / Excel / phone-call intake with a self-service portal: external event organizers ("partners") submit requests and watch them move through approval, without an ops staffer transcribing an email into the system. That introduces the first **non-staff** actor into a tool that until now had only the four internal roles of [ADR-0003](./0003-session-auth-rbac-in-ops-core.md) (`ADMIN > MANAGER > OPS > VIEWER`).

A partner is not a junior staffer. They must see **their own** requests and nothing else — not the venue's whole read surface, not other partners' events, not internal inventory. So the question is two-fold: where does PARTNER sit in the RBAC ladder, and what approval flow does a partner-submitted request travel through.

The existing F10 approval ([docs/06-features/F10-approvals](../06-features/F10-approvals)) already gates `approve` / `reject` to MANAGER+ and moves a request `SUBMITTED → SCHEDULED` (approve) or `→ RELEASED` (reject). The temptation is to invent a richer multi-stage chain now that there is an external submitter.

## Decision

**PARTNER is a new role one rank *below* VIEWER; partner reads are row-scoped by `EventRequest.createdById`; approval stays the single MANAGER+ step F10 already ships.**

- **Ladder**: `ADMIN > MANAGER > OPS > VIEWER > PARTNER`. PARTNER is the floor of the ladder, not a peer of staff. A PARTNER has **no** general read access to the tool — it can create an `EventRequest` and read back only rows it owns. See [docs/02-domain/PARTNER_PORTAL.md](../02-domain/PARTNER_PORTAL.md).
- **Row scoping by ownership**: every partner-facing read filters `WHERE createdById = req.actor.id`. The columns already exist — `EventRequest` and `Reservation` carry `createdById` — so this is a filter, not a schema change. A partner requesting a row it does not own gets **404**, never 403: existence itself is not disclosed to a non-owner.
- **Single-step approval, reused verbatim**: a partner-submitted request enters the *same* queue and travels the *same* F10 transition. A MANAGER+ approves (`→ SCHEDULED`) or rejects (`→ RELEASED`). No new role gate, no new state, no second signer. The portal **removes the email**; it does not add an approval stage.
- **Staff approve, partners submit and watch.** PARTNER can never approve — it is below VIEWER, and approval is MANAGER+. The gate holds regardless of how the request arrives (portal, copilot, or staff UI), exactly as in [ADR-0003](./0003-session-auth-rbac-in-ops-core.md).

## Consequences

- **The portal is purely additive.** PARTNER below VIEWER means no existing route widens its audience; staff-tier reads are unaffected because PARTNER fails every `requireRole(VIEWER+)` gate. The only new surface is the partner-scoped intake.
- **Ownership is the authorization boundary.** Because reads filter on `createdById`, a partner is structurally incapable of seeing another partner's event — enforced in the query, not in a view template. 404-on-unowned keeps the row set non-enumerable.
- **No new approval machinery to get wrong in three days.** Reusing F10 means the audited `approve`/`reject` path and its state transitions are already tested. The demo gains an external submitter without a second state machine.
- **Multi-stage approval is deferred, not denied.** A real venue may eventually want finance + ops + safety sign-offs. That is logged as an open question, not built — see `docs/09-questions/OPEN.md` under F15.

## Alternatives considered

- **PARTNER *above* VIEWER.** Rejected: VIEWER reads the whole tool surface (inventory, all requests, all reservations). An external organizer must not. Placing PARTNER above VIEWER would either over-expose the venue or force re-gating every existing read; below-VIEWER + ownership scoping is the minimal, safe placement.
- **A separate multi-stage approval chain for partner requests.** Rejected for the demo: it doubles the state machine and the audit surface for no brief requirement — the brief asks to *remove email*, which single-step F10 already does. Logged as a deferred question in `docs/09-questions/OPEN.md` so a future finance/safety sign-off can supersede this ADR rather than being smuggled in now.
- **403 on an unowned row.** Rejected: a 403 confirms the row exists, letting a partner enumerate other events' IDs. 404 leaks nothing.
- **A `partnerId` column distinct from `createdById`.** Rejected: `createdById` already records who filed the request and is the natural ownership key. A parallel column is a redundant source of truth that can drift from the audit actor.
