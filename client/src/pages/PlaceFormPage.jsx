import React, { useContext, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import toast from 'react-hot-toast'
import Perks from '../components/Perks'
import PhotoUploader from '../components/photos/PhotoUploader'
import { ErrorState, LoadingState } from '../components/Status'
import { api, errorMessage } from '../lib/api'
import { useFetch } from '../lib/useFetch'
import { UserContext } from '../UserContext'

const EMPTY = { title: '', address: '', photos: [], description: '', perks: [], extraInfo: '', checkIn: '14:00', checkOut: '11:00', maxGuests: 2, price: '' };

// Client-side checks mirroring the API's, for instant feedback.
const problemsWith = (form) => {
  const problems = [];
  if (!form.title.trim()) problems.push('Add a title.');
  if (!form.address.trim()) problems.push('Add an address.');
  if (!form.photos.length) problems.push('Add at least one photo.');
  if (!form.description.trim()) problems.push('Add a description.');
  if (!form.checkIn || !form.checkOut) problems.push('Set check-in and checkout times.');
  const guests = Number(form.maxGuests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 16) problems.push('Guests must be between 1 and 16.');
  const price = Number(form.price);
  if (!Number.isInteger(price) || price < 1) problems.push('Set a nightly price in whole shillings.');
  return problems;
};

const Section = ({ title, hint, children }) => (
  <section className="border-b border-gray-200 py-8 last:border-b-0">
    <h2 className="text-2xl font-semibold">{title}</h2>
    {hint && <p className="mt-1 text-gray-600">{hint}</p>}
    <div className="mt-4">{children}</div>
  </section>
)

// The listing form. Keyed by listing id, so it always starts from `initial`.
export const PlaceForm = ({ id, initial }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initial);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState([]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setPhotos = (update) => setForm((f) => ({ ...f, photos: typeof update === 'function' ? update(f.photos) : update ?? [] }));

  const save = async (e) => {
    e.preventDefault();
    if (photosUploading) {
      toast.error('Wait for your photos to finish uploading.');
      return;
    }
    const found = problemsWith(form);
    setProblems(found);
    if (found.length) return;

    setSaving(true);
    const body = { ...form, maxGuests: Number(form.maxGuests), price: Number(form.price) };
    try {
      if (id) await api.put(`/places/${id}`, body);
      else await api.post('/places', body);
      toast.success(id ? 'Listing updated' : 'Listing created');
      navigate('/profile/places');
    } catch (error) {
      const details = error.response?.data?.details;
      setProblems(details?.length ? details.map((d) => d.message) : [errorMessage(error, 'Could not save your listing.')]);
      setSaving(false);
    }
  };

  return (
    <form className="mx-auto w-full max-w-3xl" onSubmit={save} noValidate>
      <Link to="/profile/places" className="text-sm font-semibold underline">← Your listings</Link>
      <h1 className="mt-2 text-3xl font-semibold">{id ? 'Edit your listing' : 'Create a listing'}</h1>

      <Section title="Title and location" hint="Short titles work best. Have fun with it; you can always change it later.">
        <label htmlFor="place-title" className="text-sm font-semibold">Title</label>
        <input id="place-title" type="text" maxLength={120} value={form.title} onChange={set('title')} placeholder="e.g. Lakeside cabin with a hot tub" />
        <label htmlFor="place-address" className="mt-3 block text-sm font-semibold">Address</label>
        <input id="place-address" type="text" maxLength={200} value={form.address} onChange={set('address')} placeholder="e.g. Naivasha, Nakuru" />
      </Section>

      <Section title="Photos">
        <PhotoUploader photos={form.photos} onChange={setPhotos} toast={toast} onUploadingChange={setPhotosUploading} />
      </Section>

      <Section title="Description" hint="Share what makes your place special.">
        <label htmlFor="place-description" className="sr-only">Description</label>
        <textarea id="place-description" rows={5} maxLength={5000} value={form.description} onChange={set('description')} />
      </Section>

      <Section title="What this place offers">
        <Perks selected={form.perks} onChange={(perks) => setForm((f) => ({ ...f, perks }))} />
      </Section>

      <Section title="House rules and extra info">
        <label htmlFor="place-extra" className="sr-only">Extra information</label>
        <textarea id="place-extra" rows={4} maxLength={2000} value={form.extraInfo} onChange={set('extraInfo')} placeholder="e.g. No parties. Quiet hours after 10pm." />
      </Section>

      <Section title="Check-in, guests and price">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="place-checkin" className="text-sm font-semibold">Check-in time</label>
            <input id="place-checkin" type="time" value={form.checkIn} onChange={set('checkIn')} />
          </div>
          <div>
            <label htmlFor="place-checkout" className="text-sm font-semibold">Checkout time</label>
            <input id="place-checkout" type="time" value={form.checkOut} onChange={set('checkOut')} />
          </div>
          <div>
            <label htmlFor="place-guests" className="text-sm font-semibold">Maximum guests</label>
            <input id="place-guests" type="number" min={1} max={16} value={form.maxGuests} onChange={set('maxGuests')} />
          </div>
          <div>
            <label htmlFor="place-price" className="text-sm font-semibold">Price per night (Kshs.)</label>
            <input id="place-price" type="number" min={1} step={1} value={form.price} onChange={set('price')} placeholder="e.g. 8500" />
          </div>
        </div>
      </Section>

      {problems.length > 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-semibold">Please fix the following:</p>
          <ul className="mt-1 list-inside list-disc">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <button type="submit" className="primary mb-8" disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : 'Create listing'}</button>
    </form>
  );
};

// Create (/profile/places/new) or edit (/profile/places/:id) a listing.
const PlaceFormPage = () => {
  const { id } = useParams();
  const { user } = useContext(UserContext);
  const { data: place, loading, error, reload } = useFetch(id ? `/places/${id}` : null);

  if (!id) return <PlaceForm key="new" initial={EMPTY} />;
  if (loading) return <LoadingState label="Loading your listing…" />;
  if (error) return <ErrorState message={error.response?.status === 404 ? 'This listing doesn’t exist.' : errorMessage(error)} onRetry={reload} />;
  if (String(place.owner) !== String(user.id)) return <ErrorState message="You can only edit your own listings." />;
  return <PlaceForm key={id} id={id} initial={{ ...EMPTY, ...place, price: place.price ?? '' }} />;
};

export default PlaceFormPage
