import React from 'react'
import { Link } from 'react-router'
import { privateSeo, useSeo } from '../lib/seo'

const PageNotFound = () => {
  useSeo(privateSeo('Page not found'));
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <p className="text-6xl font-bold text-primary">404</p>
      <h1 className="text-2xl font-semibold">We can’t find that page</h1>
      <p className="text-gray-600">The link may be broken, or the page may have moved.</p>
      <Link to="/" className="mt-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary hover:bg-primary-hover">
        Go home
      </Link>
    </div>
  );
}

export default PageNotFound
