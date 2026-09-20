import React from 'react'
import { Link, useParams } from 'react-router'
import TripCard from '../components/TripCard'
import { ErrorState, LoadingState } from '../components/Status'
import { errorMessage } from '../lib/api'
import { useFetch } from '../lib/useFetch'

// One booking, as seen by its guest (or host).
const BookingPage = () => {
  const { id } = useParams();
  const { data: booking, loading, error, reload } = useFetch(`/bookings/${id}`);

  if (loading) return <LoadingState label="Loading your booking…" />;
  if (error) {
    const missing = error.response?.status === 404;
    return <ErrorState message={missing ? 'This booking doesn’t exist or isn’t yours.' : errorMessage(error)} onRetry={missing ? undefined : reload} />;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link to="/profile/bookings" className="inline-flex items-center gap-1 text-sm font-semibold underline">← All trips</Link>
      <h1 className="text-3xl font-semibold">Your booking</h1>
      <TripCard booking={booking} />
      {booking.place && (
        <Link to={`/place/${booking.place._id}`} className="inline-block rounded-lg border border-gray-900 bg-white px-5 py-2.5 font-semibold hover:bg-gray-50">
          View the listing
        </Link>
      )}
    </div>
  )
}

export default BookingPage
