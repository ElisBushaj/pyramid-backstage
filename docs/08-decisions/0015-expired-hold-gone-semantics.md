# ADR-0015: Expired-hold approval returns 410 Gone, not 429

- **Status**: Accepted
- **Date**: 2026-06-21

## Context

The canonical journey of this product is **request → hold → approve → scheduled**. A reservation is taken as a short-lived `HELD` lease (default 30 min, [ASSUMPTIONS.md](../../.planning/ASSUMPTIONS.md)); a MANAGER+ then approves, which confirms the hold and advances the request to `SCHEDULED` (F10).

The F10 design ([F10-T01](../06-features/F10-approvals/TASKS.md), the `openapi.yaml` approvals note) promised that *"if any held reservation expired before approval, the endpoint returns 409 with the re-detected `Conflict[]`."* The implementation diverged from that promise in a way the frontend audit surfaced as the single highest-severity bug:

`approvals/service.ts` re-detects conflicts for an expired hold and splits two ways — **slot retaken** (live conflict) → `409 reservation.expired` with the conflicts, but **lease merely lapsed, nobody contended** (the common case) → `APIError.rateLimited()` → **`429 common.rate_limited`, marked retryable**. Seeded demo holds expire hours before approval, so for *every aged but uncontested hold* the approve endpoint returns a permanent, contract-undocumented `429`. The frontend only special-cases `409`, so the error is swallowed: the page still says "Feasible — ready to approve" and the click does nothing. The standalone `reservations.confirm()` path is *also* asymmetric — it always throws `409 reservation.expired` even when the re-detected conflict set is empty.

A `429` is semantically wrong here: it says *"too many requests, back off and retry,"* but retrying never succeeds — the lease is gone and the only cure is to **re-hold**. The two expired-hold outcomes are genuinely different and deserve different status codes.

This is distinct from `reservations.hold()`'s `429`, which fires *only* after `MAX_HOLD_ATTEMPTS` serialization aborts with no real conflict — true write contention, where retry **is** the correct cure. That one stays.

## Decision

**An approve/confirm against a lapsed `HELD` lease with no live conflict returns `410 Gone` with `messageKey: reservation.hold_expired` ("the hold expired — re-hold the space"). The retaken-slot case keeps `409 reservation.expired` + `Conflict[]`. Genuine serialization contention keeps `429`.**

- **New error factory.** `APIError.gone(messageKey = "common.gone")` → `{ status: 410, error: "gone" }`; `defaultErrorCode` gains `case 410: "gone"`. `410` joins the canonical error contract.
- **New message key.** `reservation.hold_expired`, registered in `MESSAGE_KEYS` and added to both `locales/en.json` and `al.json` (matched counts, per the i18n test). It is **distinct** from `reservation.expired` (the 409 "retaken" key) — they mean different things.
- **`approvals.approve`**: the expired-hold branch becomes `conflicts.length === 0 → throw APIError.gone("reservation.hold_expired")` (410); non-empty → keep `409 reservation.expired`. The `429` (`rateLimited()`) on this path is removed.
- **`reservations.confirm`**: made symmetric — expired + uncontested → `410 reservation.hold_expired`; expired + retaken → `409 reservation.expired`.
- **`reservations.hold`**: **unchanged**. Its post-retry `429` is real contention and the test that codifies it stays.
- **Contract**: `openapi.yaml` documents a `410` response on `POST /private/requests/{id}/approve` and `POST /private/reservations/{id}/confirm`, with a reusable `Gone` response component; the NB comment is corrected to describe the 410 (uncontested) vs 409 (retaken) split.
- **Tests**: the existing assertions that codify `429`-on-uncontested-expired (`approvals.test.ts`) and `409`-on-any-expired-confirm (`reservations.test.ts`) are **rewritten** to the new split; a contention-abort case is kept distinct. `reservations.concurrency.test.ts` (the legitimate hold `429`) is left untouched.
- **Frontend**: gates "Feasible — ready to approve" on hold validity (`reservation.expiresAt > now`) and surfaces the `410`/`429`/`5xx` approve errors with a re-hold affordance (paired work, F10/F06 frontend tasks).

## Consequences

- **The core journey gives feedback again.** An aged hold yields a clear, actionable `410 "re-hold the space"` instead of a silent, permanently-retrying `429`. `429` now means exactly one thing across the system: *write contention, retry may help*.
- **Purely additive contract change.** `410` is a new documented response and `reservation.hold_expired` a new key; no existing response is removed or renamed, so no client breaks. Per [TYPE_SHARING.md](../04-api/TYPE_SHARING.md) the frontend mirrors the new error code; the AI mirror is unaffected (no AI consumer of this path).
- **Supersedes the F10 "expired → 409" promise for the uncontested case.** F10-T01's acceptance is refined here: retaken → 409 (as written), lapsed-uncontested → 410 (new). This ADR is the source of truth; F10 docs reference it.
- **One more error code to handle.** Clients that lumped everything non-2xx into a generic toast keep working; clients that want the re-hold path branch on `410`. The shared frontend mutation-error helper maps `410`/`429` to the re-hold/retry copy.

## Alternatives considered

- **Keep `429` for the uncontested case.** Rejected: it is the bug. `429` advertises "retryable / rate-limited"; an expired lease is neither — retry is futile, the cure is re-hold. It also collides semantically with the legitimate `hold()` contention `429`.
- **Use `409` for *both* expired cases (the original F10 promise).** Rejected: a `409 Conflict` carrying an **empty** `Conflict[]` is a degenerate, confusing shape ("conflict with no conflicts"), and the frontend's 409 path renders a conflict/alternatives UI that makes no sense when nothing actually clashes. `410 Gone` ("the thing you held is no longer here") is the precise HTTP semantic for a lapsed lease.
- **A `2xx` auto-re-hold inside approve.** Rejected: silently re-taking a lapsed lease can grab a slot the requester no longer wants or that pricing/conflicts have changed under; re-hold must be an explicit, audited action, not a hidden side effect of approve.
