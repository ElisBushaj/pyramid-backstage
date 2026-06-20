# Domain — Partner Portal (the new front door)

Today a partner who wants to run an event emails, calls, or sends an Excel — the exact chaos this project exists to replace. The portal makes the **request the front door**: a partner signs in, files an [event request](./REQUESTS.md) against the validated shape, watches its status, and a manager approves or rejects it in-app. No inbox, no phone tag.

## The PARTNER role
A new role **below** `VIEWER`: `PARTNER < VIEWER < OPS < MANAGER < ADMIN`. A partner is an external organiser, not staff — they can file and track *their own* requests and nothing else. They never see the inventory, the conflict engine internals, other partners' events, or any staff tooling. RBAC placement and the row-scoping rule are fixed in [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md).

## Row-scoping
Every `EventRequest` already carries `createdById`. A partner's reads and writes are **scoped to rows they created**:
- `GET /requests` lists only `where createdById = req.actor.id`.
- `GET /requests/:id` for a row they don't own returns **`404 not_found`**, not `403` — an unknown-other request is, to a partner, indistinguishable from a non-existent one. We don't leak the existence of other partners' events.
- Staff (`OPS+`) are unscoped and see everything.

This is the one filter `requestsService.list` doesn't apply today; the portal turns it on for `PARTNER`. See [REQUESTS.md](./REQUESTS.md).

## Intake flow
1. Partner files a request — form-validated to `EventRequestInput`, or composed via the AI intake copilot (below) which only ever *proposes* the structured shape.
2. Request lands `DRAFT → PROPOSED`; the partner sees its status and, once a plan exists, the read-only operational plan for *their* event.
3. A `MANAGER+` reviews the queue and approves or rejects.
4. The partner watches the status move to `APPROVED`/`SCHEDULED` or `REJECTED` — in the portal, never by email.

## Single-step approval
The approval chain is **one step**, reusing the existing **F10** approve/reject path unchanged: a `MANAGER+` approves (`→ APPROVED`, held reservations confirmed) or rejects (`→ REJECTED`, holds released). There is no multi-tier sign-off — deliberately, per [ADR-0010](../08-decisions/0010-partner-role-and-approval-chain.md). The admin **approval queue** is just a manager-facing list of `PROPOSED` requests awaiting that single decision; the decision is the same F10 transition, audited the same way.

## Where the AI plugs in
The reasoning layer ([AI_ORCHESTRATION.md](./AI_ORCHESTRATION.md)) attaches at two seams, both advisory:
- **Intake copilot** — turns a partner's natural-language brief into a validated `EventRequestInput`. Proposes; the partner confirms; ops-core creates the request.
- **Approval recommendation** — for a manager reviewing the queue, the AI surfaces a per-request *recommendation* (feasible / conflicts / cost summary) drawn from the deterministic plan. It is a hint next to the decision, never the decision — the `MANAGER+` still makes the F10 call.

When the AI acts against ops-core on a partner's behalf it carries the partner's identity via forwarded-actor headers under the service token, so audit and row-scoping stay correct — see [ADR-0012](../08-decisions/0012-ai-ops-core-service-token-auth.md).

See [F15 SPEC](../06-features/F15-partner-portal/SPEC.md) for the portal screens, the scoped endpoints, and the approval-queue contract.
