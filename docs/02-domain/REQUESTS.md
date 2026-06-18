# Domain — Event Requests

The inquiry that starts everything: "I'd like to organize a startup conference for 180 people next month."

## Shape
`title`, `organizerName`, `contactEmail/Phone`, `expectedAttendees`, `eventType`, `preferredDates[]` (one or more candidate windows), `requirements { layout, avNeeded, cateringNeeded, notes }`.

Created either by a staff member (form) or by the AI from natural language (`POST /chat` → structured `EventRequestInput` → `POST /requests`). The AI only ever *proposes*; the request is created against this validated shape.

## Lifecycle
```
DRAFT ──► PROPOSED ──► APPROVED ──► SCHEDULED ──► COMPLETED
   └──────────────────────────────► REJECTED
```
- **DRAFT** — captured, not yet costed.
- **PROPOSED** — a plan exists (space matched, assets held, quote generated, tasks drafted).
- **APPROVED** — a `MANAGER+` approved; held reservations are confirmed.
- **SCHEDULED** — confirmed and on the calendar; task list is live.
- **COMPLETED** / **REJECTED** — terminal.

Transitions are **guarded** in the service layer. Any illegal move → `409 invalid_transition { from, to }`. Each transition writes an `AuditEntry`.

## Aggregate
`GET /requests/:id` returns the **`RequestAggregate`** — request + reservation + quote + tasks + conflicts + audit — the single payload the "operational plan" page renders. The AI's `OperationalPlan` is this data plus a generated narrative.
