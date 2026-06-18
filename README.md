# Pyramid Backstage

Turn an event **request** into an event-ready **operational plan** for the Pyramid of Tirana — replacing the emails, spreadsheets, and phone calls behind every event with one source of truth.

> A venue ops team types a messy request — *"startup conference, 180 people, late next month, needs a stage and mics"* — and the system answers **"yes, here's how"**: matched space, generated quote, reserved assets, conflict check, and a setup/teardown task plan — or **"not as-is, here are the alternatives."**

## Architecture

Two services, one shared contract ([`ops-core/openapi.yaml`](./ops-core/openapi.yaml)):

| Service | Owner | Stack | Role |
|---------|-------|-------|------|
| **`ops-core`** | Elis | Express 5 · TS · Prisma 7 · Postgres · NATS | Deterministic source of truth (state + rules) |
| **`ai-orchestrator`** | Alvin | FastAPI · LangGraph · Claude · ChromaDB · Redis | Reasoning layer (no state) — *scaffold + mock here* |
| **`frontend`** | — | Vite · React 19 · React Router 7 · Tailwind 4 · Radix | Command Center (chat + live dashboard) |

The brain understands the request and decides what to do; the record knows what's true and enforces it. The brain never holds domain state; the record never reasons. That split is what lets the two be built in isolation.

## Quickstart

```bash
# bring the whole system up
cd infrastructure && docker compose up

# ops-core:        http://localhost:4000   (/health, /api/v1/...)
# ai-orchestrator: http://localhost:8000   (or the stateful mock on :4010)
# frontend:        http://localhost:5173
```

Seed the demo data (4 halls, realistic inventory, staff users, a planted conflict):

```bash
cd ops-core && pnpm db:seed
```

## How the work is organized

This repo runs on a **self-tracking documentation system** — an AI agent picks the next eligible task, implements it, and regenerates the dashboard, resuming across sessions with no state loss.

- **Start here**: [`CLAUDE.md`](./CLAUDE.md) — the operating guide.
- **The plan**: [`docs/00-strategy/MASTER_PLAN.md`](./docs/00-strategy/MASTER_PLAN.md).
- **Live dashboard**: [`STATUS.md`](./STATUS.md) (generated).
- **The work**: [`docs/06-features/`](./docs/06-features/) — `SPEC.md` + `TASKS.md` per feature.
- **The contract**: [`docs/04-api/CONTRACT.md`](./docs/04-api/CONTRACT.md) + `ops-core/openapi.yaml`.
- **The design handoff**: [`docs/05-frontend/DESIGN_SYSTEM.md`](./docs/05-frontend/DESIGN_SYSTEM.md) — paste into Claude Design to generate the UI.

## Status

3-day build in progress. `ops-core` ships in full; `ai-orchestrator` is scaffolded with a stateful mock and a reference backlog (`docs/06-features/A00`); the `frontend` is built from the Claude Design export against the frozen contract.
