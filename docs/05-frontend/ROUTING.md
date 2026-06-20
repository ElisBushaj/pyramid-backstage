# Frontend — Routing

React Router 7, `createBrowserRouter`. One `RootLayout` (Suspense + `ScrollRestoration` + error boundary). Authenticated routes sit under `AppShell`; `/login` uses `AuthShell`.

```
/login                       → AuthShell · §1.1
/                            → AppShell · Dashboard §3.1
/requests                    → Requests list §4.1
/requests/new                → Intake (chat | form) §4.2
/requests/:id                → OperationalPlanView §4.3
/calendar                    → Schedule/Availability §4.4
/spaces  /spaces/:id         → Spaces §5.1 / §5.2
/inventory  /inventory/:id   → Inventory §5.3 / §5.4
/tasks                       → Task board §6.1
/conflicts                   → Conflicts §6.2
/approvals                   → Pending Approvals queue §6.4 (RequireRole MANAGER+)
/audit                       → Audit timeline §7.1
/scan                        → Mobile Scanner §11.1 (RequireRole OPS+)
/settings/users              → Users & roles §9.1 (ADMIN)
*                            → 404
```

## Partner portal route group (PARTNER role)
The partner experience is a separate group under its own stripped shell (`PortalShell` — no staff sidebar/topbar), guarded by `RequireRole(PARTNER)`. Partners only ever reach these routes; staff roles are redirected to `/`. Row-scoping is server-enforced (ops-core filters `EventRequest.createdById`, F15) — the UI never queries staff data.

```
/portal                      → PortalShell · Partner intake §10.1
/portal/my-requests          → My requests timeline §10.2
```

## Guards
- Unauthenticated → redirect to `/login` (the API client throws `401`; a route guard catches it).
- Role gates are **server-enforced** (ops-core `requireRole`); the UI mirrors them for affordance only — e.g. VIEWER sees Approve disabled with a tooltip, but the real gate is the `403` from `POST /approve`. Never trust the client for authorization.
- `RequireRole(min)` is a thin route guard mirroring the server rank (`PARTNER < VIEWER < OPS < MANAGER < ADMIN`). It gates affordance, not authority: `/approvals` (MANAGER+) and `/scan` (OPS+) hide from lesser roles; the real gate stays the ops-core `403`.
- **Role-based landing**: a `PARTNER` who hits `/` (or any staff route) is redirected to `/portal`; a staff role who hits `/portal/*` is redirected to `/`. Partners live entirely in the portal group under `PortalShell` and never see the staff `AppShell`.

## Lazy loading
Eager: shell, Dashboard, Requests, OperationalPlanView (the hot path). Lazy: `/calendar`, `/audit`, `/settings/*`, `/approvals`, `/scan` (the camera/scanner deps), and the whole `/portal/*` group + `PortalShell` (a separate audience — never loaded for staff).
