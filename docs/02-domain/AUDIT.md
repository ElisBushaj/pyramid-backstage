# Domain — Audit

"Maintain a complete record of decisions, changes, and approvals" is an explicit requirement and an easy, high-value win. The **audit ledger** is the record, written in the **same transaction** as the state change it describes.

## Audit ledger (`AuditEntry`)
Append-only. Written on **every** mutation and decision. Fully defined (the PDF left it as a stub):
```
{ id, actorId, actorName, action, entityType, entityId, requestId?, before?, after?, reason?, at }
```
- `actorId` is the authenticated staff member (real, from `req.actor` — never anonymous). This is *why* auth is in scope: a decision log without a decider is worthless.
- `action` is a dotted verb: `request.create`, `reservation.hold`, `reservation.confirm`, `quote.generate`, `request.approve`, `request.reject`, `space.update`, …
- `before`/`after` capture the diff for state changes; `reason` is required on rejects.
- Never updated or deleted. `GET /audit?requestId` reconstructs an entity's full history.

## Written in the state transaction
The `AuditEntry` is written **inside the same transaction** as the state change it records — never a separate, after-the-fact write that could be lost or drift from the change it describes. ([CORE_PATTERNS.md](../04-api/CORE_PATTERNS.md))
