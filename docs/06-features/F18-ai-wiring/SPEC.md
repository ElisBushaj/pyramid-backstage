---
id: F18
name: Frontend AI Wiring
phase: Integration
depends_on: [F13, F15, F17]
status: not_started
last_updated: 2026-06-20
---

# F18 — Frontend AI Wiring

## Summary

The headline demo: the presentational `CopilotPanel` becomes the live copilot. A `VITE_AI_URL` client calls the AI's `POST /chat` (stateful, keyed by `sessionId`) and `POST /plan` (the deterministic LangGraph planner → `OperationalPlan`); the plan renders into `RequestDetail`; proposed actions gated by `requiresApproval` route a confirm into the ops-core F10 approve endpoint (so the AI proposes but ops-core still authorizes); and a surfaced `plan.conflicts` drives an alternatives → re-plan loop. The whole surface **degrades to canned mode** the instant the AI is unreachable or `VITE_AI_URL` is unset — the locked fallback — so the demo never depends on the AI being live. F18 is wiring + render only: it writes nothing to ops-core except through the existing F10/F15 endpoints, and it invents no contract — it consumes `docs/04-api/AI_CONTRACT.md` and the F17 service-token seam the AI authenticates through.

## Scope

### In scope
- `frontend/src/api/ai.ts` — a `VITE_AI_URL` client for `POST /chat` (`{ sessionId, message }`) and `POST /plan` (`{ requestId }` or an `EventRequestInput`), with abort/timeout/`409` handling, that returns a degrade signal (`null`) when `VITE_AI_URL` is unset or the AI is unreachable.
- `frontend/src/api/types/ai.ts` — hand-mirrored AI DTOs (`ChatRequest`/`ChatResponse`, `OperationalPlan`, `ProposedAction`) from `docs/04-api/AI_CONTRACT.md`.
- TanStack `useChat` / `usePlan` hooks with a per-conversation `sessionId` lifecycle and abort-on-unmount.
- Wiring the existing `CopilotPanel` states (`assistant-thinking`, `plan-preview`, `proposed-action`, `conflict-heads-up`, `error`) to live data, including the `requiresApproval` gate → ops-core F10 approve on confirm, and the conflict → alternatives → re-plan loop.
- Rendering `OperationalPlan` (narrative + the plan body) into the `RequestDetail` plan skeleton, with an i18n-wrapped narrative.
- The same wiring reused by the F15 partner-intake copilot.
- Degrade-to-canned fallback verified (AI down → the panel's existing presentational mode), manually + by unit test.

### Out of scope
- The AI endpoints' **implementation** (`POST /chat`, `POST /plan`, the LangGraph planner) — Alvin's lane (`A00`); F18 only consumes them over `docs/04-api/AI_CONTRACT.md`.
- The service-token auth seam the AI uses to reach ops-core — F17; F18 does not forward tokens, it talks to the AI which talks to ops-core.
- The approve/reject **mechanics** — F10; the confirm gate calls `POST /private/requests/:id/approve` unchanged.
- The partner row-scoping filter — F15; F18 only reuses the copilot inside the partner intake surface.
- The `FloorMap` render of `/plan` output — F19 owns the map component; F18 supplies the `OperationalPlan` it renders from.
- Persisting chat transcripts or `sessionId` server-side beyond a single conversation — the lifecycle is client-held for the demo; durable sessions are additive later.

## Acceptance criteria

- `frontend/src/api/ai.ts` reads `import.meta.env.VITE_AI_URL`; when it is **unset/empty**, every call resolves to `null` (the degrade signal) without a network attempt — the canned panel is the guaranteed floor.
- `POST /chat` sends `{ sessionId, message }` and returns the mirrored `ChatResponse`; `POST /plan` accepts either `{ requestId }` or an inline `EventRequestInput` and returns an `OperationalPlan`; both honour an `AbortSignal` and a bounded timeout, and a network error / non-2xx / timeout resolves to `null` (degrade), never an unhandled throw.
- A `409` from `POST /plan` (a plan that cannot be satisfied — conflicts) is surfaced as a structured result carrying `plan.conflicts` + `alternatives`, distinct from the `null` degrade path, so the panel can render the heads-up rather than fall back to canned.
- `frontend/src/api/types/ai.ts` mirrors `ChatRequest`/`ChatResponse`, `OperationalPlan`, and `ProposedAction` exactly per `docs/04-api/AI_CONTRACT.md` (field names, enums, optionality); the local `ProposedAction.requiresApproval` flag the panel already keys on maps 1:1 onto the contract field (per `docs/04-api/TYPE_SHARING.md`, the FE hand-mirror tier).
- `useChat`/`usePlan` (TanStack) own a per-conversation `sessionId` (a fresh UUID v4 minted when a conversation starts, stable across that conversation's turns) and abort their in-flight request on unmount so a closed panel cancels its `assistant-thinking` request.
- `CopilotPanel` drives off live state: a sent message → `assistant-thinking` while `/chat` (or `/plan`) is in flight; a returned `OperationalPlan` → `plan-preview` rendering the plan card; an action carrying `requiresApproval` → `proposed-action`, and **Confirm** calls `POST /private/requests/:id/approve` (F10, `MANAGER+`) — surfacing the F10 `409 conflict` (expired hold) and `403` (insufficient role) inline rather than silently committing.
- When the returned plan carries `conflicts`, the panel renders `conflict-heads-up` from `plan.conflicts` + `alternatives`; **Re-plan** re-calls `POST /plan` with the chosen alternative window, looping back to `plan-preview` on success — the propose → conflict → re-plan loop the demo narrates.
- `OperationalPlan.narrative` renders through the i18n wrapper (`useT`, EN/AL) into the `RequestDetail` plan skeleton; the plan body (spaces/assets/tasks the plan proposes) renders into the same skeleton so a request shows its AI-built operational plan in place.
- The F15 partner-intake copilot reuses this exact wiring (same `ai.ts` client + hooks) so partners get the same propose/plan experience, scoped by their session.
- **Degrade verified**: with `VITE_AI_URL` unset *or* the AI returning errors/timeouts, `CopilotPanel` falls to its existing presentational mode (canned turns, the `error` surface offering reconnect) with no console error and no broken render — confirmed manually and by unit test.

## Data model

No models, no migration — F18 is frontend-only. It mirrors AI DTOs (`ChatRequest`/`ChatResponse`, `OperationalPlan`, `ProposedAction`) under `frontend/src/api/types/ai.ts` and reuses the existing ops-core mirrors (`EventRequest`, `Conflict`, the request aggregate) it already renders. No ops-core write originates here except the F10 approve call on Confirm. See `docs/04-api/AI_CONTRACT.md` and `docs/04-api/TYPE_SHARING.md`.

## API surface

No new ops-core endpoints. F18 consumes two surfaces:
- The AI, over `VITE_AI_URL` — `POST /chat` (`{ sessionId, message }` → `ChatResponse`) and `POST /plan` (`{ requestId }` | `EventRequestInput` → `OperationalPlan`), per `docs/04-api/AI_CONTRACT.md`.
- ops-core, unchanged — `POST /private/requests/:id/approve` (F10) for the Confirm gate, and the existing request reads `RequestDetail` already uses.

## UI surfaces

- **`CopilotPanel`** (`frontend/src/components/command/CopilotPanel.tsx`) — now live: `assistant-thinking` / `plan-preview` / `proposed-action` / `conflict-heads-up` / `error` driven by `useChat`/`usePlan`, with the `requiresApproval` confirm gate and the re-plan loop. Degrades to its current presentational mode.
- **`RequestDetail`** (`frontend/src/pages/RequestDetail.tsx`) — the `OperationalPlan` (narrative + plan body) renders into the plan skeleton.
- **Partner intake** (F15 `/portal/*`) — reuses the copilot wiring for partner-side propose/plan.

## Notes

- The AI contract this consumes (`/chat` stateful by `sessionId`, `/plan` → `OperationalPlan`, the `409`-with-alternatives shape, `ProposedAction.requiresApproval`): [docs/04-api/AI_CONTRACT.md](../../04-api/AI_CONTRACT.md).
- "The AI proposes, ops-core authorizes" — Confirm routes through the F10 `MANAGER+` approve, never a direct AI write: [docs/06-features/F10-approvals/SPEC.md](../F10-approvals/SPEC.md) and [docs/02-domain/AI_ORCHESTRATION.md](../../02-domain/AI_ORCHESTRATION.md).
- The service-token seam the AI authenticates to ops-core through (forwarded actor + role ceiling) — F18 does not touch it, but it is why an AI-driven approve still audits the real human: [docs/06-features/F17-ai-auth/SPEC.md](../F17-ai-auth/SPEC.md) and ADR [docs/08-decisions/0012-ai-ops-core-service-token-auth.md](../../08-decisions/0012-ai-ops-core-service-token-auth.md).
- The partner intake surface that reuses this wiring (and the AI-recommendation slot in the approvals queue F18 fills): [docs/06-features/F15-partner-portal/SPEC.md](../F15-partner-portal/SPEC.md).
- The `FloorMap` that renders `/plan` output behind its prop contract: [docs/06-features/F19-floor-map/SPEC.md](../F19-floor-map/SPEC.md) and [docs/05-frontend/FLOOR_MAP.md](../../05-frontend/FLOOR_MAP.md).
- The degrade-to-canned fallback is the locked decision — the demo never depends on the AI being live; the FE hand-mirror discipline: [docs/04-api/TYPE_SHARING.md](../../04-api/TYPE_SHARING.md). Error shapes the client maps to degrade: [docs/04-api/ERROR_CONTRACT.md](../../04-api/ERROR_CONTRACT.md).
