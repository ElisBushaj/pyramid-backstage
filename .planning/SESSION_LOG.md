# Session Log

Append-only log of session-level events (round boundaries, cross-cutting artifacts, recoveries) so the next session inherits context without re-reading every commit. 3–5 lines per entry.

## Format
```
## YYYY-MM-DD — <session label>
- <what shipped / what changed at the program level>
- <new cross-cutting artifact: a new MESSAGE_KEY namespace, a new migration, a new outbox subject…>
- <next session should start with…>
```

---

## 2026-06-18 — Bootstrap
- Stood up the repo: directory tree, the **locked contract** (`ops-core/openapi.yaml`), the memory system (`CLAUDE.md`, `STATUS.md`, `.planning/`), and the numbered docs (`docs/02-domain`, `03-data`, `04-api`).
- Authored the feature backlog `docs/06-features/F00..F13` (ops-core, the 3-day build) + `A00` (ai-orchestrator reference, Alvin's lane).
- Cross-cutting decisions recorded as ADRs 0001–0009; open questions Q-01..Q-0n in `docs/09-questions/OPEN.md`.
- **Next session**: read `STATUS.md`, start at `F00-T01` (repo scaffold), proceed in dependency order.

## 2026-06-20 — Beyond-Booking expansion (docs reconciled to Alvin's new requirements)
- Merged `origin/alvin/phase-a-spine` onto branch **`feat/beyond-booking`** — brings `docs/03-data/spaces.catalog.json` (19-space catalog), root `COLLABORATION.md`, `New_Docs/` floor plans, and the wired `/plan` AI spine onto the build.
- Authored the **F14–F19** backlog (Space Catalog · Partner Portal+Approval · QR/NFC Asset Tracking · AI↔ops-core Service-Token Auth · Frontend AI Wiring · v1 FloorMap) = **35 new tasks**, plus **ADRs 0010–0014**, new domain docs (`ASSET_TRACKING.md`, `PARTNER_PORTAL.md`), `docs/04-api/AI_CONTRACT.md`, `docs/05-frontend/FLOOR_MAP.md`, and additive updates across strategy/architecture/data/api/frontend/operations/questions. Stage A (docs) is complete; ops-core/frontend code unchanged.
- New cross-cutting surfaces to land in Stage B: `Role` gains `PARTNER` (below VIEWER); new `AssetMovement` model + `asset.moved` outbox subject + `asset.scan` audit action; `Space` extension fields (slug/category/zone/isCirculation/adjacent/map/ceilingCm); service-token + `X-Acting-User-*` auth; envs `VITE_AI_URL`, `OPS_CORE_SERVICE_TOKEN`.
- **Next session**: execute Stage B in waves — Wave 1 = **F14, F16, F17** (start at `F14-T01`). Run `node .planning/tasks.mjs regen` after each task; keep `openapi.yaml` + `mock-ops-core` updated first so Alvin is unblocked.

## 2026-06-20 — Beyond-Booking EXECUTED (F14–F19 shipped)
- All six features implemented, tested, and committed on `feat/beyond-booking`: **F14** (19-space catalog + additive Space fields), **F17** (AI service-token auth + forwarded actor + ceiling), **F16** (QR/NFC scan + AssetMovement ledger + scanner UI + "where is it" board), **F15** (PARTNER role + row-scoping + portal + approvals queue), **F18** (live `/chat` + `/plan` wiring, degrade-to-canned), **F19** (v1 radial FloorMap digital twin). Only `F19-T05` (v2 SVG-hotspot FloorMap) deferred (ADR-0014).
- **Verified**: ops-core **230/230 vitest** green; ops-core + frontend **tsc clean**; frontend **vite build** green; seed deterministic (19 spaces, planted Blue@W1 conflict, demo PARTNER). 4 prisma migrations applied to dev + test DBs.
- New cross-cutting surfaces now live: Role `PARTNER`; `AssetMovement` + `asset.moved` outbox + `asset.scan` audit; Space extension fields; service-token + `X-Acting-User-*` auth; envs `VITE_AI_URL`, `OPS_CORE_SERVICE_TOKEN`; FE deps `qrcode`. STATUS.md: 110/111 ops-core done.
- **Next session**: live end-to-end verification with the stack up (`docker compose up`, run the ai-orchestrator for live `/plan`); visual QA of the new UI on host Vite :5173; then open a PR for `feat/beyond-booking`. Optional: F19-T05 v2 FloorMap.
