import React from 'react'
import TripCard from '../components/TripCard'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { errorMessage } from '../lib/api'
import { useFetch } from '../lib/useFetch'

// The signed-in guest's trips.
const BookingsPage = () => {
  const { data: bookings, loading, error, reload } = useFetch('/me/bookings');

  if (loading) return <LoadingState label="Loading your trips…" />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (!bookings.length) {
    return <EmptyState title="No trips booked… yet!" message="Time to dust off your bags and start planning your next adventure." action={{ to: '/', label: 'Start searching' }} />;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-3xl font-semibold">Trips</h1>
      <ul className="space-y-4">
        {bookings.map((booking) => (
          <li key={booking._id}>
            <TripCard booking={booking} linkTo={`/profile/bookings/${booking._id}`} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export default BookingsPage
