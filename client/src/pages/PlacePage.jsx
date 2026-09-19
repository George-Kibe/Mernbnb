import React, { useContext, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import PhotoGrid from '../components/photos/PhotoGrid'
import PhotoTour from '../components/photos/PhotoTour'
import { ErrorState, LoadingState } from '../components/Status'
import { api, errorMessage } from '../lib/api'
import { formatPrice, nightsBetween } from '../lib/format'
import { dayString, readSearch, totalGuests } from '../lib/search'
import { useFetch } from '../lib/useFetch'
import { UserContext } from '../UserContext'

// Airbnb-style reservation card. Prices shown here are estimates; the server
// computes the real total.
export const BookingWidget = ({ place }) => {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [trip] = useState(() => readSearch(searchParams)); // prefilled from the navbar search
  const [checkIn, setCheckIn] = useState(trip.checkIn ? dayString(trip.checkIn) : '');
  const [checkOut, setCheckOut] = useState(trip.checkOut ? dayString(trip.checkOut) : '');
  const [guests, setGuests] = useState(Math.min(Math.max(totalGuests(trip), 1), place.maxGuests));
  const [name, setName] = useState(user?.name ?? '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const today = format(new Date(), 'yyyy-MM-dd');
  const nights = checkIn && checkOut ? nightsBetween(`${checkIn}T00:00:00Z`, `${checkOut}T00:00:00Z`) : 0;
  const datesInvalid = Boolean(checkIn && checkOut && nights < 1);

  if (user && String(user.id) === String(place.owner)) {
    return (
      <div className="rounded-2xl border border-gray-200 p-6 shadow-lg">
        <p className="font-semibold">This is your listing.</p>
        <Link to={`/profile/places/${place._id}`} className="mt-3 inline-block font-semibold underline">Edit listing</Link>
      </div>
    );
  }

  const reserve = async (e) => {
    e.preventDefault();
    if (!user) {
      navigate('/login', { state: { from: `${location.pathname}${location.search}`, reason: 'Log in to book this place.' } });
      return;
    }
    if (!checkIn || !checkOut || nights < 1) return setError('Choose your check-in and checkout dates.');
    if (!name.trim() || !phoneNumber.trim()) return setError('Add your name and phone number.');
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/bookings', { placeId: place._id, checkIn, checkOut, guests: Number(guests), name, phoneNumber });
      toast.success('Booking confirmed!');
      navigate(`/profile/bookings/${data._id}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not complete your booking.'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={reserve} noValidate className="rounded-2xl border border-gray-200 p-6 shadow-lg">
      <p className="text-xl"><span className="font-semibold">{formatPrice(place.price)}</span> night</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-400">
        <div className="grid grid-cols-2 divide-x divide-gray-400">
          <label className="block p-3">
            <span className="block text-[10px] font-bold uppercase">Check-in</span>
            <input type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="w-full bg-transparent text-sm outline-none" aria-label="Check-in date" />
          </label>
          <label className="block p-3">
            <span className="block text-[10px] font-bold uppercase">Checkout</span>
            <input type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="w-full bg-transparent text-sm outline-none" aria-label="Checkout date" />
          </label>
        </div>
        <label className="block border-t border-gray-400 p-3">
          <span className="block text-[10px] font-bold uppercase">Guests</span>
          <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className="w-full bg-transparent text-sm outline-none" aria-label="Guests">
            {Array.from({ length: place.maxGuests }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
          </select>
        </label>
      </div>
      {datesInvalid && <p className="mt-2 text-sm text-red-600 dark:text-red-400">Checkout must be after check-in.</p>}

      {nights > 0 && (
        <div className="mt-4 space-y-2">
          <label htmlFor="booking-name" className="text-sm font-semibold">Full name</label>
          <input id="booking-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <label htmlFor="booking-phone" className="text-sm font-semibold">Phone number</label>
          <input id="booking-phone" type="text" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+254…" />
        </div>
      )}

      {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      <button type="submit" className="primary mt-4" disabled={submitting || datesInvalid}>
        {submitting ? 'Reserving…' : user ? 'Reserve' : 'Log in to reserve'}
      </button>
      {nights > 0 && (
        <>
          <p className="mt-2 text-center text-sm text-gray-600">You won’t be charged yet</p>
          <div className="mt-4 flex justify-between text-gray-700">
            <span className="underline">{formatPrice(place.price)} × {nights} {nights === 1 ? 'night' : 'nights'}</span>
            <span>{formatPrice(place.price * nights)}</span>
          </div>
          <div className="mt-4 flex justify-between border-t border-gray-200 pt-4 font-semibold">
            <span>Total</span>
            <span>{formatPrice(place.price * nights)}</span>
          </div>
        </>
      )}
    </form>
  );
};

const PlacePage = () => {
  const { id } = useParams();
  const { data: place, loading, error, reload } = useFetch(`/places/${id}`);
  const [tourIndex, setTourIndex] = useState(null); // photo tour open at this index

  if (loading) return <LoadingState label="Loading this place…" />;
  if (error) {
    return error.response?.status === 404
      ? <ErrorState message="This place doesn’t exist or is no longer listed." />
      : <ErrorState message={errorMessage(error)} onRetry={reload} />;
  }

  return (
    <article className="mx-auto mt-6 max-w-6xl">
      <h1 className="text-2xl font-semibold md:text-3xl">{place.title}</h1>
      <a
        title={`Search ${place.address} on Google Maps`}
        className="my-2 inline-flex items-center gap-2 font-semibold underline underline-offset-2"
        href={`https://maps.google.com/?q=${encodeURIComponent(place.address)}`}
        target="_blank"
        rel="noreferrer"
      >
        {place.address}
      </a>
      <div className="mt-4">
        <PhotoGrid photos={place.photos} title={place.title} onOpen={setTourIndex} />
      </div>
      {tourIndex !== null && <PhotoTour photos={place.photos} title={place.title} startIndex={tourIndex} onClose={() => setTourIndex(null)} />}

      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold">About this place</h2>
            <p className="mt-2 whitespace-pre-line text-gray-700">{place.description}</p>
          </section>
          {place.perks?.length > 0 && (
            <section className="border-t border-gray-200 pt-8">
              <h2 className="text-2xl font-semibold">What this place offers</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">{place.perks.map((perk) => <li key={perk}>✓ {perk}</li>)}</ul>
            </section>
          )}
          <section className="border-t border-gray-200 pt-8">
            <h2 className="text-2xl font-semibold">Things to know</h2>
            <ul className="mt-3 space-y-1 text-gray-700">
              <li>Check-in after {place.checkIn}</li>
              <li>Checkout before {place.checkOut}</li>
              <li>{place.maxGuests} guests maximum</li>
            </ul>
            {place.extraInfo && <p className="mt-3 whitespace-pre-line text-gray-700">{place.extraInfo}</p>}
          </section>
        </div>
        <aside className="md:sticky md:top-28 md:self-start">
          <BookingWidget place={place} />
        </aside>
      </div>
    </article>
  )
}

export default PlacePage
