# Type Sharing

No code is shared between services. Types are **hand-mirrored** from one source of truth: `ops-core/openapi.yaml`. (Same posture as marketplace ADR-0004 — small team, contract is small, generation overhead not yet worth it.)

```
ops-core/openapi.yaml                 ← source of truth (the contract)
        │
        ├──►  ops-core/src/types/api/*.ts        (DTOs the backend implements)
        │
        ├──►  frontend/src/api/types/*.ts         (verbatim mirror; only what the UI consumes)
        │
        └──►  ai-orchestrator/app/schemas.py      (Pydantic mirror; the AI's tool I/O)
```

## Rules
- **One file per domain area**: `spaces.ts`, `assets.ts`, `requests.ts`, `reservations.ts`, `quotes.ts`, `tasks.ts`, `conflicts.ts`, `audit.ts`, `auth.ts`.
- The `ServiceResponse<T>` envelope type is identical on both TS sides (`api/types/_envelope.ts`); only `T` differs per endpoint.
- The frontend mirrors **only what it consumes**. The AI mirrors the full tool surface.
- **Drift is caught two ways**: (1) a contract test asserts the `openapi.yaml` example payloads validate against the TS types; (2) PR review.

## Generation aid (optional, not required)
A `pnpm gen:types` script may emit `ops-core/src/types/api/*` from `openapi.yaml` to reduce hand-mirroring toil — but the YAML remains the source of truth and the emitted files are committed and reviewed like any code. The frontend + Python mirrors stay hand-written so they carry only the consumed surface.
