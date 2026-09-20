import React from 'react'
import { Link } from 'react-router'
import ImageComponent from './ImageComponent'
import { formatDay, formatPrice, nightsBetween } from '../lib/format'

// A booking summary: photo, place, dates, guests and total.
const TripCard = ({ booking, linkTo }) => {
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  // The host can delete a listing once its stays are over.
  const place = booking.place ?? { title: 'Listing removed', address: 'No longer on AirBuenas' };
  const body = (
    <>
      <div className="w-full shrink-0 overflow-hidden rounded-xl sm:w-48">
        <ImageComponent place={booking.place ?? null} />
      </div>
      <div className="min-w-0 grow py-1">
        <p className="text-sm text-gray-600">{place.address}</p>
        <h2 className="truncate text-lg font-semibold">{place.title}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:max-w-md">
          <dt className="text-gray-600">Check-in</dt><dd>{formatDay(booking.checkIn)}</dd>
          <dt className="text-gray-600">Checkout</dt><dd>{formatDay(booking.checkOut)}</dd>
          <dt className="text-gray-600">Guests</dt><dd>{booking.guests ?? 1}</dd>
          <dt className="text-gray-600">Total ({nights} {nights === 1 ? 'night' : 'nights'})</dt><dd className="font-semibold">{formatPrice(booking.price)}</dd>
        </dl>
      </div>
    </>
  );
  const className = 'flex flex-col gap-4 rounded-2xl border border-gray-200 p-3 sm:flex-row';
  return linkTo ? <Link to={linkTo} className={`${className} transition hover:shadow-md`}>{body}</Link> : <div className={className}>{body}</div>;
}

export default TripCard
