import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import PlaceListings from '../components/PlaceListings'
import { LoadingState } from '../components/Status'
import { loadDestinations } from '../lib/destinations'
import { formatPrice } from '../lib/format'
import { takeInitialData } from '../lib/initialData'
import { destinationSeo, useSeo } from '../lib/seo'
import PageNotFound from './PageNotFound'

// Destination landing page, e.g. /stays/diani-beach: the listings in one
// place, with its own title and description for search engines. The footer
// and listing breadcrumbs link here.
const StaysPage = () => {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const page = Math.max(Number.parseInt(searchParams.get('page'), 10) || 1, 1);
  // Server-rendered visits arrive with the destination and first results.
  const [initial] = useState(() => takeInitialData('stays', (stays) => stays.destination?.slug === slug));
  // { slug, destination }: destination is null when no listing matches.
  const [lookup, setLookup] = useState(() => (initial ? { slug, destination: initial.destination } : { slug: null }));
  const destination = lookup.slug === slug ? lookup.destination : undefined;

  useEffect(() => {
    if (lookup.slug === slug) return undefined;
    let cancelled = false;
    loadDestinations().then((list) => {
      if (!cancelled) setLookup({ slug, destination: list.find((d) => d.slug === slug) ?? null });
    });
    return () => { cancelled = true; };
  }, [slug, lookup.slug]);

  useSeo(destination ? destinationSeo(destination, page) : null);

  if (destination === undefined) return <LoadingState label="Loading stays…" />;
  if (destination === null) return <PageNotFound />;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mt-6 text-sm text-gray-600">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li><Link to="/" className="hover:underline">Home</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-semibold text-gray-900">{destination.name}</li>
        </ol>
      </nav>
      <div className="mt-2">
        <h1 className="text-2xl font-semibold md:text-3xl">Vacation rentals in {destination.name}</h1>
        <p className="mt-1 text-gray-600">
          {destination.count} {destination.count === 1 ? 'stay' : 'stays'}
          {destination.minPrice > 0 && ` · from ${formatPrice(destination.minPrice)} a night`}
        </p>
      </div>
      <PlaceListings key={slug} location={destination.name} initial={initial?.listings} />
    </>
  )
}

export default StaysPage
