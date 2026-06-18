# QA — Verification Plan

The system for verifying that **every area of the contract works** and **every page matches the design**. Designed to be executed and tracked by a human tester or an AI agent driving the running stack + API. It is intentionally separate from [`docs/06-features/`](../06-features/) (which tracks *building*) — this tracks *verifying*.

## The three artifacts

| File | What | Answers |
|---|---|---|
| [`CHECKLIST.md`](./CHECKLIST.md) | **Functional** verification — area-keyed checks grounded in the contract. | Does it *work*? |
| [`DESIGN-PARITY.md`](./DESIGN-PARITY.md) | **Visual** verification — does each page match the Claude Design export, every state? | Does it *look right*? |
| [`FINDINGS.md`](./FINDINGS.md) | The running defect log — every `fail` gets an entry. | What's broken? |

Two parallel checklists (function vs. design); each is worked top-to-bottom and resumed from wherever the last session stopped.

## Task format & conventions

Functional checks have a stable ID `QA-<AREA>-<NN>`, a rollup `Status`, and concrete checkbox assertions:

```
### QA-RESV-01 — Concurrent holds → exactly one 409
**Status:** not_started · **Spec:** F06

- [ ] Two parallel POST /reservations for the same scarce asset/window → exactly one 201, one 409 { conflicts }
- [ ] Inventory decrements once, never twice
- [ ] The 409 body carries the offending Conflict[]
```

**Functional area codes:** `AUTH SPACE ASSET REQ AVAIL RESV QUOTE TASK CONFLICT APPROVE AUDIT EVENTS I18N A11Y INFRA`.
Design-parity uses `QA-DSGN-<§>` IDs keyed to the page sections in [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md).

## Status values

The line a human/AI updates and a grep tallies:

| Status | Meaning |
|---|---|
| `not_started` | not yet executed |
| `in_progress` | partially executed |
| `pass` | every checkbox verified, no defects |
| `fail` | one or more checkboxes failed — **must** have a `FINDINGS.md` entry |
| `blocked` | cannot execute (missing dependency, data, or feature not built yet) |
| `na` | not applicable in this environment (e.g. NATS disabled → realtime checks `na`) |

**Rules**
- A task is `pass` only when **all** its checkboxes are ticked and none regressed.
- A `fail` task links its defect: `**Status:** fail (see [F-003](./FINDINGS.md#f-003))`.
- Tick a checkbox only after you **observe** the result — not because the code "should" do it.
- Verify each user-visible string in **both** locales (`al` default, `en`) at least once per area.
- Check the **console + network tab**: zero uncaught errors, no 4xx/5xx on happy paths.

## Progress tally (the rule)

Re-tally after each session by grepping the `Status:` lines in each list, and update this table. Move each list's **▶ Resume here** pointer to the first task that isn't `pass`/`na`.

| List | total | not_started | in_progress | pass | fail | blocked | na |
|---|---|---|---|---|---|---|---|
| CHECKLIST.md (functional) | 36 | 36 | 0 | 0 | 0 | 0 | 0 |
| DESIGN-PARITY.md (visual) | — | — | — | — | — | — | — |

> DESIGN-PARITY totals are filled in once the Claude Design export lands and the per-page table is populated (the page sections are keyed to [`PAGES.md`](../05-frontend/PAGES.md) but the parity sweep can't run until there's an export to compare against).

Helpers (run from `docs/10-qa/`; swap the filename for either list):
- **Resume point:** the `### QA-…` heading just above the first `**Status:** not_started`/`in_progress`.
- **Counts:** `grep -c '^\*\*Status:\*\* pass' CHECKLIST.md` (swap `pass` for `fail`/`blocked`/`na`).
- **Total tasks:** `grep -c '^### QA-' CHECKLIST.md`.

## Environment (run the full stack)

Bring the stack up and seed it per [`docs/07-operations/RUNBOOK.md`](../07-operations/RUNBOOK.md):

```bash
cd infrastructure && docker compose up -d
cd ../ops-core && pnpm db:seed        # 4 halls, inventory, staff roles, planted conflict
```

The seed provides the **test-account matrix** (one user per role) and the demo data the checks reference:

| Handle | Role | Why it exists |
|---|---|---|
| `ADMIN1` | ADMIN | user management, the admin tier |
| `MANAGER1` | MANAGER | approvals (the MANAGER+ gate) |
| `OPS1` | OPS | inventory/reservation writes |
| `VIEWER1` | VIEWER | read-only enforcement (403 on writes/approve) |

**Lean on automated coverage first** — it catches regressions for free: `cd ops-core && pnpm test` (unit + integration on real Postgres, incl. the engine's **property tests** and the concurrency test). If it's red, fix that before manual sweeps.

## Definition of done (whole sweep)

- Every task in `CHECKLIST.md` **and** `DESIGN-PARITY.md` is `pass`, `na`, or `blocked` with a reason.
- No `fail` remains open; each closed `fail` links a resolved `FINDINGS.md` entry.
- The progress tally above is current and both ▶ Resume pointers sit at the end of their lists.
- A full re-run of `pnpm test` (ops-core) and the frontend suite is green.

## Cross-references

- **The contract the functional checks are grounded in:** [`docs/04-api/CONTRACT.md`](../04-api/CONTRACT.md) + [`ops-core/openapi.yaml`](../../ops-core/openapi.yaml) + [`docs/04-api/ERROR_CONTRACT.md`](../04-api/ERROR_CONTRACT.md).
- **The pages the parity checks key to:** [`docs/05-frontend/PAGES.md`](../05-frontend/PAGES.md), [`docs/05-frontend/DESIGN_SYSTEM.md`](../05-frontend/DESIGN_SYSTEM.md).
- **The demo path (a good smoke sweep):** [`docs/07-operations/DEMO_SCRIPT.md`](../07-operations/DEMO_SCRIPT.md).
