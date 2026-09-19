import React from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router'
import { privateSeo, useSeo } from '../lib/seo'

// Shown instead of a blank screen when a page crashes or a route fails.
const ErrorPage = () => {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  useSeo(privateSeo(notFound ? 'Page not found' : 'Something went wrong'));
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-bold text-primary">{notFound ? '404' : 'Oops'}</p>
      <h1 className="text-2xl font-semibold">{notFound ? 'We can’t find that page' : 'Something went wrong'}</h1>
      <p className="max-w-md text-gray-600">
        {notFound ? 'The link may be broken or the page may have moved.' : 'An unexpected error occurred. Reloading the page usually helps.'}
      </p>
      <div className="mt-2 flex gap-3">
        <Link to="/" className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover">Go home</Link>
        {!notFound && (
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-gray-900 bg-white px-5 py-2.5 font-semibold hover:bg-gray-50">
            Reload
          </button>
        )}
      </div>
    </div>
  )
}

export default ErrorPage
