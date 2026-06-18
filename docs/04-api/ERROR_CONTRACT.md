# Error Contract

So the agent can branch **deterministically** and the UI can render localized messages, every error path returns one of these shapes. All carry a `messageKey` (i18n) and the canonical machine `error` string.

| HTTP | `error` | When | Extra fields |
|------|---------|------|--------------|
| 400 | `bad_request` | Malformed request (not field-level) | — |
| 401 | `unauthorized` | No / invalid session | — |
| 403 | `forbidden` | Authenticated but role too low | — |
| 404 | `not_found` | Unknown entity id | — |
| 409 | `conflict` | A reservation would violate availability | `conflicts: Conflict[]` |
| 409 | `invalid_transition` | Illegal state-machine move (e.g. confirm a RELEASED hold; approve a REJECTED request) | `from`, `to` |
| 409 | `idempotency_key_mismatch` | Same `Idempotency-Key`, different body | — |
| 422 | `validation` | Field-level validation failed | `fields: { <field>: <messageKey> }` |
| 429 | `rate_limited` | Too many attempts (login, etc.) | — |
| 500 | `internal` | Unhandled | — |

## Canonical bodies

```jsonc
// 409 reservation conflict — the agent's conflict branch keys off this
{ "status": 409, "error": "conflict", "messageKey": "reservation.conflict",
  "conflicts": [
    { "type": "SPACE_DOUBLE_BOOKED", "spaceId": "space_blue",
      "conflictingRequestIds": ["req_5a1"],
      "window": { "start": "2026-07-22T07:00:00Z", "end": "2026-07-22T20:00:00Z" },
      "detail": "Blue Hall already reserved for req_5a1 in this window." }
  ] }

// 409 invalid transition
{ "status": 409, "error": "invalid_transition", "messageKey": "request.invalid_transition",
  "from": "REJECTED", "to": "APPROVED" }

// 422 validation
{ "status": 422, "error": "validation", "messageKey": "validation.failed",
  "fields": { "expectedAttendees": "validation.required" } }
```

## Why these exact shapes

- **`conflict` returns the full `Conflict[]`** — the AI doesn't have to re-query to explain *why* it failed; the explanation data is in the rejection. This is what powers "Blue is taken that week; Orange seats 180 in theater — shall I hold it?"
- **`invalid_transition` names `from`/`to`** — a double-click or out-of-order call gets a precise, safe rejection instead of corrupting state.
- **`fields` is keyed by field → messageKey** — the frontend renders the message inline against the right input, in the active locale.

Every error is thrown as a typed `APIError` (never `throw new Error`). See [CORE_PATTERNS.md](./CORE_PATTERNS.md).
