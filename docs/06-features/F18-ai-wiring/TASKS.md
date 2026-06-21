---
id: F18
name: Frontend AI Wiring
last_updated: 2026-06-21
---

# F18 — Tasks

### F18-T01 — frontend/src/api/ai.ts: VITE_AI_URL client for POST /chat + POST /plan with degrade
- Status: done
- Depends on: F13-T02, F17-T01
- Estimate: 0.75d
- Acceptance:
  - `frontend/src/api/ai.ts` reads `import.meta.env.VITE_AI_URL`; when it is unset/empty, `chat()` and `plan()` resolve to `null` (the degrade signal) **without** a network attempt — the canned `CopilotPanel` is the guaranteed floor (the locked fallback per `docs/06-features/F18-ai-wiring/SPEC.md`).
  - `chat(body: ChatRequest)` POSTs `{ sessionId, message }` to `${VITE_AI_URL}/chat` and returns the mirrored `ChatResponse`; `plan(body)` POSTs `{ requestId }` **or** an inline `EventRequestInput` to `${VITE_AI_URL}/plan` and returns an `OperationalPlan` — both per `docs/04-api/AI_CONTRACT.md`.
  - Both accept an `AbortSignal` and enforce a bounded client timeout; a network error, non-2xx, abort, or timeout resolves to `null` (degrade), never an unhandled throw (mirrors the `client.ts` discipline, separate from it — the AI is a different base URL).
  - A `409` from `/plan` is returned as a **structured** result carrying `plan.conflicts` + `alternatives` (distinct from the `null` degrade), so the panel can render the heads-up instead of falling back to canned (per `docs/04-api/ERROR_CONTRACT.md`).
  - tsc clean; conforms to the FE client + hand-mirror conventions in `docs/04-api/TYPE_SHARING.md`.

### F18-T02 — frontend/src/api/types/ai.ts: hand-mirror the AI DTOs
- Status: done
- Depends on: F13-T02
- Estimate: 0.25d
- Acceptance:
  - `frontend/src/api/types/ai.ts` mirrors `ChatRequest`, `ChatResponse`, `OperationalPlan`, and `ProposedAction` exactly from `docs/04-api/AI_CONTRACT.md` — field names, enums (UPPER_SNAKE), RFC-3339 `Z` timestamps, and optionality — and is re-exported from `frontend/src/api/types/index.ts` alongside the existing mirrors.
  - `ProposedAction.requiresApproval` maps 1:1 onto the flag `CopilotPanel`'s local `ProposedAction` already keys on, and `OperationalPlan` exposes `narrative`, the plan body (proposed spaces/assets/tasks), and `conflicts?: Conflict[]` (reusing the existing `Conflict` mirror from `types/_envelope.ts`, not a redefinition).
  - No runtime code — types only; tsc clean; conforms to `docs/04-api/TYPE_SHARING.md` (the FE hand-mirror tier, enforced by the contract test).

### F18-T03 — TanStack useChat/usePlan hooks + sessionId lifecycle + abort-on-unmount
- Status: done
- Depends on: F18-T01, F18-T02
- Estimate: 0.5d
- Acceptance:
  - `useChat` and `usePlan` (TanStack `useMutation`, added to `frontend/src/api/hooks.ts`) wrap `ai.chat`/`ai.plan`; a `null` result is exposed to callers as a degrade flag (not an error toast), so a down AI never surfaces as a failed mutation.
  - A per-conversation `sessionId` (fresh UUID v4 minted when a conversation starts, stable across that conversation's turns, reset when the panel opens a new conversation) is owned by the hook layer and threaded into every `/chat` call.
  - In-flight requests carry an `AbortController` and are aborted on unmount (a closed `CopilotPanel` cancels its pending `assistant-thinking` request); a re-plan supersedes any prior in-flight `/plan` (abort + reissue).
  - tsc clean; conforms to the TanStack hook conventions already in `frontend/src/api/hooks.ts`.

### F18-T04 — wire CopilotPanel states to live data + requiresApproval gate + conflict re-plan loop
- Status: done
- Depends on: F18-T03, F10-T01, F15-T05
- Estimate: 1d
- Acceptance:
  - A sent message puts `CopilotPanel` into `assistant-thinking` while `/chat` (or `/plan`) is in flight; a returned `OperationalPlan` transitions to `plan-preview` rendering the plan card; an action carrying `requiresApproval` transitions to `proposed-action` (the existing "REQUIRES APPROVAL" gate) — driving the panel's existing `state` prop, no new states invented.
  - **Confirm** on a `requiresApproval` action calls `POST /private/requests/:id/approve` (F10, `MANAGER+`) via the existing approve mutation — the AI proposes, ops-core authorizes; the F10 `409 conflict` (expired hold) and `403 forbidden` (insufficient role) surface inline, never a silent commit (per `docs/06-features/F10-approvals/SPEC.md`).
  - When the returned plan carries `conflicts`, the panel renders `conflict-heads-up` from `plan.conflicts` + `alternatives`; **Re-plan** re-calls `usePlan` with the chosen alternative window and loops back to `plan-preview` on success — the propose → conflict → re-plan loop (per `docs/02-domain/AI_ORCHESTRATION.md`).
  - The wiring lives where the panel is hosted (`frontend/src/pages/RequestDetail.tsx` and the F15 partner intake), not inside the presentational `CopilotPanel.tsx` — the component stays prop-driven; only its `on*` callbacks and `state` are now fed by live hooks.
  - tsc clean; unit/component test asserts the state machine: thinking → plan-preview → proposed-action → (confirm calls approve) and plan-with-conflicts → heads-up → re-plan.

### F18-T05 — render OperationalPlan into RequestDetail (i18n narrative) + partner-intake reuse
- Status: done
- Depends on: F18-T04
- Estimate: 0.5d
- Acceptance:
  - `OperationalPlan.narrative` renders through the i18n wrapper (`useT`, EN/AL) into the `RequestDetail` plan skeleton; any new copy keys land in both `frontend/src/i18n/` locale bundles with key-count parity (matching the FE i18n discipline).
  - The plan body (proposed spaces/assets/tasks from the `OperationalPlan`) renders into the same `RequestDetail` plan skeleton so a request shows its AI-built operational plan in place; absent a plan, the skeleton renders its existing empty/placeholder state.
  - The F15 partner-intake copilot reuses the **same** `ai.ts` client + `useChat`/`usePlan` hooks (no fork) so partners get the same propose/plan experience scoped by their session (per `docs/06-features/F15-partner-portal/SPEC.md`).
  - The `OperationalPlan` rendered here is the same object the F19 `FloorMap` consumes (`docs/06-features/F19-floor-map/SPEC.md`) — one plan, two renders; no divergent shape.
  - tsc clean; conforms to `docs/04-api/TYPE_SHARING.md`.

### F18-T06 — degrade-to-canned fallback verified (manual + unit)
- Status: done
- Depends on: F18-T04
- Estimate: 0.25d
- Acceptance:
  - With `VITE_AI_URL` **unset**, `CopilotPanel` renders its existing presentational mode (canned/seeded turns) with no network attempt, no console error, and no broken render — the locked fallback (per `docs/06-features/F18-ai-wiring/SPEC.md`).
  - With `VITE_AI_URL` set but the AI returning errors/timeouts, `ai.ts` resolves `null` and the panel degrades to the same canned mode (or the `error` surface offering "Reconnect") — the demo never hard-depends on the AI being live.
  - Unit test: `ai.chat`/`ai.plan` return `null` when `VITE_AI_URL` is unset and when fetch rejects/times out; a component test asserts the panel does not enter `assistant-thinking` indefinitely on a degraded call (it falls back).
  - Manual verification noted: copilot opened with the AI down still renders and is interactive; tsc clean; vitest passing.

### F18-T07 — AppShell Copilot wire + ⌘K command palette + connectivity pill; RequestDetail narrative data-driven
- Status: done
- Depends on: F13-T07
- Estimate: 0.75d
- Acceptance:
  - Global Copilot input/send wired to the live `/chat` path with the same graceful 503 degrade as Intake (no AI logic built — Alvin’s lane).
  - Top-bar Search becomes a real ⌘K command palette over requests/spaces/assets with a keybind; the connectivity pill reflects what it actually checks (`/me` reachability).
  - RequestDetail fallback narrative is request-agnostic (parameterized space/capacity from the aggregate, not the hardcoded “Blue Hall 180”). tsc + build green.
