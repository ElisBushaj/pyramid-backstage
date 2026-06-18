import { isRouteErrorResponse, useRouteError } from 'react-router'

/**
 * Route-level error boundary + 404. Rendered as the router's `errorElement`,
 * and also as the catch-all `*` route's element so an unknown path lands here
 * with a 404 affordance instead of a blank screen.
 */
export default function RootError() {
  const error = useRouteError()
  const isNotFound = isRouteErrorResponse(error) && error.status === 404

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-medium text-text-primary">
        {isNotFound ? 'Page not found' : 'Something went wrong'}
      </h1>
      <p className="text-text-secondary">
        {isNotFound
          ? "The page you're looking for doesn't exist."
          : 'An unexpected error occurred. Please try again.'}
      </p>
      <a href="/" className="text-accent underline-offset-4 hover:underline">
        Go home
      </a>
    </div>
  )
}
