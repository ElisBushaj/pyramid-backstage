import { createBrowserRouter } from 'react-router'
import RootLayout from './RootLayout'
import RootError from './RootError'
import { RequireAuth } from '@/components/shell/RequireAuth'
import { AppShell } from '@/components/shell/AppShell'
import { PortalShell } from '@/components/shell/PortalShell'
import PortalRequests from '@/pages/portal/PortalRequests'
import PortalNewRequest from '@/pages/portal/PortalNewRequest'
import PortalRequestDetail from '@/pages/portal/PortalRequestDetail'
import Approvals from '@/pages/Approvals'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Requests from '@/pages/Requests'
import Intake from '@/pages/Intake'
import RequestDetail from '@/pages/RequestDetail'
import Spaces from '@/pages/Spaces'
import SpaceDetail from '@/pages/SpaceDetail'
import Inventory from '@/pages/Inventory'
import AssetDetail from '@/pages/AssetDetail'
import Scanner from '@/pages/Scanner'
import Tasks from '@/pages/Tasks'
import Conflicts from '@/pages/Conflicts'
import Audit from '@/pages/Audit'
import Users from '@/pages/Users'
import Calendar from '@/pages/Calendar'

export const router = createBrowserRouter([
  {
    // Root layout: mounts <ScrollRestoration/> + the route-level Suspense fallback once
    // for the whole tree (without this parent, RootLayout was dead and scroll never restored).
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
  { path: '/login', element: <Login />, errorElement: <RootError /> },
  {
    // F15 — the external partner portal (PARTNER only; PortalShell bounces staff to /).
    path: '/portal',
    element: (
      <RequireAuth>
        <PortalShell />
      </RequireAuth>
    ),
    errorElement: <RootError />,
    children: [
      { index: true, element: <PortalRequests /> },
      { path: 'new', element: <PortalNewRequest /> },
      { path: ':id', element: <PortalRequestDetail /> },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RootError />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'requests', element: <Requests /> },
      { path: 'requests/new', element: <Intake /> },
      { path: 'requests/:id', element: <RequestDetail /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'spaces', element: <Spaces /> },
      { path: 'spaces/:id', element: <SpaceDetail /> },
      { path: 'inventory', element: <Inventory /> },
      { path: 'inventory/:id', element: <AssetDetail /> },
      { path: 'scan', element: <Scanner /> },
      { path: 'tasks', element: <Tasks /> },
      { path: 'approvals', element: <Approvals /> },
      { path: 'conflicts', element: <Conflicts /> },
      { path: 'audit', element: <Audit /> },
      { path: 'settings/users', element: <Users /> },
      { path: '*', element: <RootError /> },
    ],
  },
    ],
  },
])
