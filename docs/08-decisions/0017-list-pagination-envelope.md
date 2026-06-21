# ADR-0017: Bound every list with the shared pagination envelope

- **Status**: Accepted
- **Date**: 2026-06-21

## Context

ops-core already has a paginated-list convention: `okList()` returns a `ListResponse<T>` carrying `data` **plus** sibling meta `total / page / pageSize / totalPages`, and `/requests` and `/assets/:id/movements` use it (default/max page sizes, `page`/`pageSize` query params documented in `openapi.yaml`). The frontend audit found the convention **only half-applied**, in two distinct ways:

1. **The client throws the meta away.** `api.request()` returns `envelope.data` and drops the sibling `total/page/...`, so even the endpoints that *do* paginate can't drive a pager or show "N of M." Every list page hardcodes a cap (`pageSize: 100`/`50`) and silently truncates.
2. **Two lists don't paginate at all, server-side.** `GET /private/audit` returns the **entire ledger** (bare `ok(array)`, no `page`/`pageSize` in the validator or contract), and `GET /admin/users` returns the **whole staff table** the same way. The remediation plan's hypothesis ("server already paginates, only the client drops meta") holds for requests/movements but is **false** for audit and users — those need a server + contract change, not just a client fix.

There is also a contract-documentation gap: `okList`'s meta fields are real on the wire but absent from the `openapi.yaml` `ServiceEnvelope` schema, so the frontend mirror and any contract reconciliation can't see them.

## Decision

**Standardise on one list envelope, document it in the contract, and apply it to every list — adding server-side pagination to `/audit` and `/admin/users`.**

- **Contract: a documented `ListEnvelope`.** Add `components/schemas/ListEnvelope = allOf [ServiceEnvelope, { total, page, pageSize, totalPages }]` (additive). Point `/requests`, `/assets/:id/movements`, and the newly-paginated `/audit` + `/admin/users` list responses at it. The meta the server already sends is now part of the contract.
- **`/audit`** (`audit` module): `service.list` switches `ok(array)` → `okList` with `take`/`skip` + a `count`; `validators` gain bounded `page`/`pageSize` (default `pageSize 50`, max `100`); `openapi.yaml` documents the params. Order stays newest-first-friendly for paging.
- **`/admin/users`** (`users` module): same treatment — `okList`, bounded `page`/`pageSize` (default `20`, max `100`), documented params. The staff list is no longer unbounded.
- **`/requests`, `/assets/:id/movements`**: server is already correct; **no backend change**. They only need the client to stop discarding meta.
- **Client**: a list-aware accessor (`api.getList<T>(): Promise<Paginated<T>>`) returns `{ data, total, page, pageSize, totalPages }` for `okList` routes; the mirror type `Paginated<T>` (already defined, currently unused) becomes the return shape. List hooks thread `page`; pages get a shared `Pager` ("showing N of M" + load-more/next-prev) and lower their page sizes off the hardcoded caps.
- **Tests**: integration (real Postgres) for the two newly-paginated endpoints (page boundaries, `totalPages`, clamping to max); contract test green on the additive schema/params.

## Consequences

- **No list silently truncates.** A venue with >100 requests, a long audit ledger, or many staff sees a pager and an honest total, not a capped-and-cut view. The dashboard's `?pageSize=8` audit slice is honoured instead of ignored.
- **Mostly additive; two endpoints change behaviour benignly.** `ListEnvelope`, the new query params, and the client accessor are additive. `/audit` and `/admin/users` start returning a *page* instead of everything — a behaviour change, but they already returned `data: array` under `ServiceEnvelope`, so the shape is compatible and the default page size is generous. Documented here as the locked decision.
- **One pager, six lists.** Requests, Approvals, Portal, Audit, Users, and asset movements share a single client accessor and a single `Pager` component + i18n keys, instead of each page re-inventing truncation.
- **Frontend mirror gains the meta.** `Paginated<T>` is now contract-backed, so the mirror and the hooks align with `openapi.yaml`.

## Alternatives considered

- **Client-only fix (assume the server already paginates everywhere).** Rejected: it's the remediation plan's hypothesis, and it's *wrong* for `/audit` and `/admin/users`, which use bare `ok()` — a client pager over an unbounded server response still fetches the whole table on page one.
- **Cursor/keyset pagination.** Rejected for this pass: the existing convention is offset `page`/`pageSize`, the data volumes are venue-scale (hundreds–thousands, not millions), and matching the established `okList` shape keeps all six lists uniform. Keyset can supersede this ADR later if a ledger grows unbounded.
- **Leave `/audit` unbounded "because it's append-only and small in the demo."** Rejected: it's the one ledger guaranteed to grow forever, and the audit page fetches + renders all of it on every mount (and per keystroke once filters are debounced). Bounding it is the highest-value pagination fix.
- **Infinite scroll only, no totals.** Rejected as the sole UI: an explicit "N of M" is part of the trust story the audit flagged (users couldn't tell a filtered-empty result from a truncated one). Load-more/infinite-scroll is fine *on top of* a real total.
