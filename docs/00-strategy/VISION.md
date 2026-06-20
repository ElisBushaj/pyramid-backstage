---
id: VISION
created: 2026-06-18
last_updated: 2026-06-18
status: active
owners: [elis]
---

# Vision — Pyramid Backstage

> Read this **first**, before the plan. It is the *why*. The *what order* lives in [`MASTER_PLAN.md`](./MASTER_PLAN.md); the *how* lives in [`docs/01-architecture/`](../01-architecture/) and the contract.

## The problem

Behind every event at the Pyramid of Tirana is a mess of **emails, spreadsheets, and phone calls**. An organizer asks for a hall. Someone checks a shared Excel to guess whether it's free. Someone else phones logistics to ask if there are enough chairs. A quote is typed by hand and, often enough, the total doesn't match the line items. Setup gets coordinated over WhatsApp. Two events get pencilled into the same room a week apart and nobody notices the crews can't turn it around in time. There is no single place that knows what is true, and no record of who decided what.

It works, barely, because experienced people hold the state in their heads. It does not scale, it is error-prone, and it leaves no trail.

## The system, in one sentence

**Type the messy request — get the answer: *"yes, we can make this happen — here's how,"* or *"not as-is — here are the alternatives."***

A venue ops person types *"startup conference, 180 people, late next month, needs a stage and mics."* The system answers with a concrete **operational plan**: the matched space, a generated quote with VAT, the reserved assets, the remaining inventory, a conflict check, and a setup/teardown task list — or, if it can't be done as asked, the precise reason and a real alternative (*"Blue is taken that week; Orange seats 180 in theater and is free — shall I hold it?"*). One screen. Instantly. With every decision recorded and a dashboard that updates live.

It answers the two questions that actually matter to an ops team: **"Can we do this?"** and **"What's next?"**

## Why the split wins

The system has two fundamentally different jobs, and the architecture refuses to blur them:

- **The deterministic record** (`ops-core`) **knows what is true** and enforces it — which room is free (buffers included), how many chairs are left, what a window costs, who approved what. Transactions, row locks, a relational store. It is never wrong, and it never reasons.
- **The reasoning layer** (`ai-orchestrator`) **understands the request** and decides what to do — natural language in, a plan out, conflicts explained in plain words, alternatives proposed. It holds no domain state and owns no truth.

Their only coupling is the contract ([`ops-core/openapi.yaml`](../../ops-core/openapi.yaml)). The brain proposes; the record authorizes. This is what makes the AI safe (a hallucinated total or an impossible hold simply cannot commit — the record re-validates everything), makes the two buildable in isolation, and makes the *narrative* trustworthy: the numbers in the AI's prose are injected from the record, never invented. The record is the source of truth even inside the AI's own sentence. See [ADR-0001](../08-decisions/0001-two-services-one-contract.md).

That split is also why the hard, must-be-correct half — the record — is the half this 3-day build ships **in full**.

## The north star

> **Replace the emails, the spreadsheets, and the phone calls with one source of truth that tells you instantly whether an event can happen and exactly what it takes to make it real — and proves who decided what.**

When the demo lands, the close writes itself: an operator types a request, watches a feasible plan assemble itself, submits a colliding one and watches the AI catch it and offer a way out, approves the first as a manager, and points at the dashboard updating live — *"this replaces the emails, the spreadsheets, and the phone calls."*

## Think beyond booking

The booking loop is the spine, not the ceiling. The same record-plus-reasoning split unlocks the wider operational picture the [AADF Pyramid Challenge](../../New_Docs/) asks for — and the build is now extending toward it (Phase 5, [`ROADMAP.md`](./ROADMAP.md)). The request no longer has to come from staff: a **partner portal** lets external organizers file their own intake and watch it move through an **approval chain that removes email entirely** — the manager approves in one screen, not a thread. The plan the AI assembles becomes a **digital twin of the event's logistics**: a [floor map](../05-frontend/FLOOR_MAP.md) of the Pyramid's 19 spaces showing which halls are booked, which transitional corridors and atria the event spills into, and where a conflict bites. Equipment stops being a number in a spreadsheet — **QR/NFC tags** turn every asset into something you scan to know its live location, with a movement ledger that answers *"where are the chairs?"* without a phone call. And the reasoning layer graduates from a one-shot planner to a **copilot** that intakes a request in plain language, detects the clash, proposes the alternative, and — over time — predicts allocation before you ask. None of it changes the law: the record still authorizes, the numbers still come from ops-core, and every new surface degrades to a self-sufficient fallback so the demo never depends on the brain being live.

## What success looks like (the demo, abbreviated)

1. **Type the messy request** → the AI returns *"yes, we can"* with a matched space, a VAT quote, reserved assets, remaining inventory, no conflict, and a setup task list.
2. **Submit a colliding request** → `conflict.detected` fires; the AI explains it in plain language and proposes an alternative space/time.
3. **Approve the first (as MANAGER)** → the request goes `SCHEDULED`, held reservations confirm, an audit entry is written, the task list goes live.
4. **The live dashboard updates** as it happens — and the audit trail shows exactly who decided what.

The full beat-by-beat script, mapped to pages and endpoints, is in [`docs/07-operations/DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md).

## Cross-references

- **The plan** (phases, parallelization, DoD): [`MASTER_PLAN.md`](./MASTER_PLAN.md).
- **The phased roadmap and gates**: [`ROADMAP.md`](./ROADMAP.md).
- **Who owns what**: [`ASSIGNMENTS.md`](./ASSIGNMENTS.md).
- **The contract (law)**: [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) + [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md).
- **Domain detail**: [`docs/02-domain/`](../02-domain/).
- **Decisions**: [`docs/08-decisions/`](../08-decisions/).
- **Glossary**: [`GLOSSARY.md`](./GLOSSARY.md).
