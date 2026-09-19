import React from 'react'
import { Link } from 'react-router'

// Shared page states: loading, error (with retry) and empty.

export const LoadingState = ({ label = 'Loading…' }) => (
  <div role="status" className="flex items-center justify-center gap-3 py-16 text-gray-600">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" aria-hidden="true" />
    <span>{label}</span>
  </div>
)

export const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className="mx-auto max-w-md py-16 text-center">
    <p className="text-lg font-semibold">We couldn’t load this</p>
    <p className="mt-1 text-gray-600">{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-gray-900 bg-white px-5 py-2 font-semibold hover:bg-gray-50">
        Try again
      </button>
    )}
  </div>
)

export const EmptyState = ({ title, message, action }) => (
  <div className="mx-auto max-w-md py-16 text-center">
    <p className="text-2xl font-semibold">{title}</p>
    {message && <p className="mt-2 text-gray-600">{message}</p>}
    {action && (
      <Link to={action.to} className="mt-6 inline-block rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary hover:bg-primary-hover">
        {action.label}
      </Link>
    )}
  </div>
)
