import React, { useState } from 'react'
import { Link } from 'react-router'
import toast from 'react-hot-toast'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { api, errorMessage } from '../lib/api'
import { formatPrice } from '../lib/format'
import { useFetch } from '../lib/useFetch'

// Delete asks first, in place: no dialog to dismiss, and the listing is only
// gone once "Delete listing" is pressed.
const DeleteListing = ({ place, onDeleted }) => {
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/places/${place._id}`);
      toast.success(`“${place.title}” was deleted.`);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this listing.'));
      setDeleting(false);
      setAsking(false);
    }
  };

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="self-start rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-semibold hover:bg-gray-200">
        Delete
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold">Delete this listing?</span>
      <button type="button" onClick={remove} disabled={deleting} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-on-primary hover:bg-red-700 disabled:opacity-60">
        {deleting ? 'Deleting…' : 'Delete listing'}
      </button>
      <button type="button" onClick={() => setAsking(false)} disabled={deleting} className="rounded-lg bg-gray-100 px-3 py-1.5 font-semibold hover:bg-gray-200">
        Keep it
      </button>
    </div>
  );
};

// The host's listings.
const MyPlacesPage = () => {
  const { data: places, loading, error, reload } = useFetch('/me/places');

  const addButton = (
    <Link className="inline-flex items-center gap-1 rounded-full bg-primary px-6 py-2 font-semibold text-on-primary hover:bg-primary-hover" to="/profile/places/new">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
      Add new place
    </Link>
  );

  if (loading) return <LoadingState label="Loading your listings…" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (!places.length) {
    return <EmptyState title="You don’t have any listings yet" message="Share your space and start earning." action={{ to: '/profile/places/new', label: 'Create your first listing' }} />;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Your listings</h1>
        {addButton}
      </div>
      <ul className="space-y-4">
        {places.map((place) => (
          <li key={place._id} className="rounded-2xl border border-gray-200 p-3 transition hover:shadow-md">
            <Link to={`/profile/places/${place._id}`} className="flex gap-4">
              <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:h-32 sm:w-32">
                {place.photos?.[0] && <img className="h-full w-full object-cover" src={place.photos[0]} alt={place.title} loading="lazy" />}
              </div>
              <div className="min-w-0 grow">
                <h2 className="truncate text-lg font-semibold">{place.title}</h2>
                <p className="text-sm text-gray-600">{place.address}</p>
                <p className="mt-2 line-clamp-2 text-sm text-gray-700">{place.description}</p>
                <p className="mt-2 text-sm"><span className="font-semibold">{formatPrice(place.price)}</span> night · up to {place.maxGuests} guests</p>
              </div>
            </Link>
            <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
              <DeleteListing place={place} onDeleted={reload} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MyPlacesPage
