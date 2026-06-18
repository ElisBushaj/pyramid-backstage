# Domain — Tasks (setup / teardown)

The operational checklist that turns an approved event into executed work.

## Shape
`title`, `phase` (`SETUP | TEARDOWN`), `owner` (team/role string, e.g. `ops_team`, `av_team`), `assigneeId` (optional staff), `dueOffsetHours`, `dueAt`, `status` (`TODO | IN_PROGRESS | DONE | BLOCKED`).

## Timing
`dueOffsetHours` is relative to the reserved window:
- **SETUP**: negative offset from event **start** (`-4` = setup due 4h before doors).
- **TEARDOWN**: positive offset from event **end** (`+2` = teardown due 2h after close).

`dueAt` is computed from the reservation's window so the board shows absolute times.

## Generation
The AI reasons out the list from event context + RAG templates, then **persists it through ops-core** (`POST /requests/:id/tasks`) so state stays single-sourced — the AI never holds task state. ops-core computes `dueAt` and assigns defaults.

## Coordination
Tasks are grouped by `phase` and `owner` into lanes (the `TaskBoard`). Assignment to a specific staff member and status updates flow through `PATCH` (audited). This is the "coordinate responsibilities across teams" requirement.
