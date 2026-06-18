import { createBrowserRouter } from 'react-router'
import RootLayout from './RootLayout'
import RootError from './RootError'

/**
 * Router skeleton. RootLayout is the shell; RootError is both the error
 * boundary and the 404 catch-all. Real routes (dashboard, requests, spaces,
 * approvals, …) are added here as pages land from the Claude Design export.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RootError />,
    children: [
      // Empty routed shell — `/` resolves to a blank surface until the
      // dashboard page lands. Kept inline so no placeholder page is invented.
      { index: true, element: <main className="min-h-screen bg-surface" /> },
      // 404 — anything unmatched renders the not-found affordance.
      { path: '*', element: <RootError /> },
    ],
  },
])
