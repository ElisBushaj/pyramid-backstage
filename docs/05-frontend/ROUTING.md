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
/audit                       → Audit timeline §7.1
/settings/users              → Users & roles §9.1 (ADMIN)
*                            → 404
```

## Guards
- Unauthenticated → redirect to `/login` (the API client throws `401`; a route guard catches it).
- Role gates are **server-enforced** (ops-core `requireRole`); the UI mirrors them for affordance only — e.g. VIEWER sees Approve disabled with a tooltip, but the real gate is the `403` from `POST /approve`. Never trust the client for authorization.

## Lazy loading
Eager: shell, Dashboard, Requests, OperationalPlanView (the hot path). Lazy: `/calendar`, `/audit`, `/settings/*`.
