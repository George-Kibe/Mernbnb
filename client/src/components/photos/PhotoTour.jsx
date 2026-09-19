import React, { useEffect, useState } from 'react'
import Lightbox from './Lightbox'

// Airbnb's "Show all photos" page: a scrolling layout of one full-width photo
// followed by two side by side. Clicking a photo opens the lightbox.
const PhotoTour = ({ photos, title, startIndex = 0, onClose }) => {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (startIndex > 0) document.getElementById(`tour-photo-${startIndex}`)?.scrollIntoView({ block: 'center' });
  }, [startIndex]);

  // Every third photo spans the full width; a trailing lone half does too.
  const isWide = (i) => i % 3 === 0 || (i % 3 === 1 && i === photos.length - 1);

  return (
    <div role="dialog" aria-modal="true" aria-label={`Photos of ${title}`} className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white/95 px-4 py-3 backdrop-blur md:px-8">
        <button type="button" onClick={onClose} aria-label="Close photo tour" className="grid h-9 w-9 place-items-center rounded-full bg-transparent hover:bg-gray-100">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm text-gray-600">{photos.length} photos</span>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 md:px-8">
        <h2 className="mb-6 mt-2 text-2xl font-semibold">Photo tour</h2>
        <div className="grid grid-cols-2 gap-2">
          {photos.map((src, i) => (
            <button
              key={src}
              id={`tour-photo-${i}`}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className={`overflow-hidden bg-gray-100 p-0 ${isWide(i) ? 'col-span-2 aspect-[3/2]' : 'aspect-square'}`}
            >
              <img src={src} alt={`${title} — photo ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition hover:brightness-90" />
            </button>
          ))}
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox photos={photos} startIndex={lightboxIndex} title={title} onClose={() => setLightboxIndex(null)} />
      )}
    </div>
  )
}

export default PhotoTour
