# Assumptions Log

Every default chosen in the absence of explicit guidance, with a date and one-line rationale. No silent assumptions — this log lets the user override later without re-reading code. Append-only; group by date + task.

## Format
```
## YYYY-MM-DD — F##-T## <short title>
- Assumed: <the default>.
  Rationale: <why; what real-world behavior or pattern it matches>.
```

---

## 2026-06-18 — Bootstrap (pre-F00)
- Assumed: **session auth (argon2id + httpOnly signed cookie) owned by ops-core**, not SuperTokens.
  Rationale: internal staff tool with a handful of roles; avoids a 4th container and is faster to make flawless in 3 days. (ADR-0003)
- Assumed: **VAT 20%**, single currency `ALL`, integer minor units (factor 1 for Lek).
  Rationale: Albanian standard VAT; PDF said "currency ALL, i18n-ready". (ADR-0004)
- Assumed: **default space buffers** setupBufferMinutes=240 (4h), teardownBufferMinutes=120 (2h).
  Rationale: PDF's example task `dueOffsetHours:-4`; real venues use multi-hour turnarounds. Per-space overridable. Flagged as Q-01 for the Pyramid team.
- Assumed: **HELD reservation lease = 30 min** default.
  Rationale: enough for a human to approve in the demo; short enough that abandoned holds free quickly.
- Assumed: roles **ADMIN / MANAGER / OPS / VIEWER**; approvals require MANAGER+, inventory writes OPS+.
  Rationale: maps to venue-manager / logistics / front-desk; minimal credible RBAC. Flagged as Q-02.

## 2026-06-18 — Scaffold execution (F00 groundwork)
- Assumed: **`@node-rs/argon2`** (prebuilt bindings) instead of `argon2` (node-gyp native build).
  Rationale: installs without build-essential — robust in `node:20-slim` Docker + CI. Same Argon2id algorithm. (ADR-0003)
- Assumed: **Prisma 7 driver-adapter pattern** — `PrismaPg` adapter in `config/prisma.ts` + `prisma.config.ts` holding `datasource.url = env("DATABASE_URL")`; the schema `datasource` declares only `provider`.
  Rationale: Prisma 7 dropped `url` in the schema datasource; this matches the marketplace's proven setup. Needs `DATABASE_URL` present for `prisma generate`.
- Assumed: **ChromaDB host port 8001** (container 8000) in docker-compose.
  Rationale: avoids colliding with ai-orchestrator on host 8000. (infra agent)
- Assumed: frontend pins **vite 7 + @vitejs/plugin-react 4 + @types/node 22**; `test` uses `--passWithNoTests` on the empty chassis.
  Rationale: peer-dep compatibility with the locked TS ~5.7 + Node 20 target. (infra agent)
- Assumed: ai-orchestrator default model **`claude-opus-4-8`**; the stateful mock runs **without auth** (a noted seam); `POST /plan` accepts either `{requestId}` or a full `EventRequestInput`.
  Rationale: scaffold ergonomics; verified model id via the claude-api reference. (ai agent)

## 2026-06-18 — Design↔backend alignment (pre-frontend)
- Decided: **Export** and **Duplicate-request** are **client-side** (CSV/print from loaded data; prefill a new `POST /requests`) — no backend endpoints.
  Rationale: the design's buttons don't imply server work; keeps the contract lean. See [[docs/10-qa/DESIGN-BACKEND-ALIGNMENT.md]].
- Decided: money is formatted in the frontend via `lib/money.ts` from integer minor units (EN `,` / AL `.` grouping); the design's compact `3.3L`-style KPI labels are display-only.
- Added (additive, contract stays lock-compatible): `PATCH /requests/:id` (F04-T06), `GET /requests?q=` (F04-T07), `GET /dashboard/stats` (F13-T05) to back design affordances. Build note: the structured intake form must capture `title` (required by `EventRequestInput`).
