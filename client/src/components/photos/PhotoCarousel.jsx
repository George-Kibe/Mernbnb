import React, { useRef, useState } from 'react'
import { CARD_SIZES, srcSetFor } from '../../lib/images'

const MAX_DOTS = 5;

// Listing-card image carousel. Lives inside a <Link>, so the controls
// swallow their clicks instead of navigating. `priority` is for cards at the
// top of the page: "eager" loads the cover right away instead of lazily, and
// "high" also puts it ahead of other downloads (the page's main image).
const PhotoCarousel = ({ photos = [], alt, priority }) => {
  const [index, setIndex] = useState(0);
  // The next photo is fetched once someone shows interest in the card.
  const [engaged, setEngaged] = useState(false);
  const engage = () => setEngaged(true);
  const touchStartX = useRef(null);
  const last = photos.length - 1;

  if (photos.length === 0) {
    return (
      <div className="grid aspect-square place-items-center rounded-xl bg-gray-100 text-sm text-gray-400">
        No photos yet
      </div>
    );
  }

  const go = (delta) => setIndex((i) => Math.min(Math.max(i + delta, 0), last));
  const control = (delta) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    go(delta);
  };

  // Keep the active dot inside a sliding window of MAX_DOTS.
  const firstDot = Math.min(Math.max(index - Math.floor(MAX_DOTS / 2), 0), Math.max(photos.length - MAX_DOTS, 0));
  const dots = photos.slice(firstDot, firstDot + MAX_DOTS).map((_, i) => firstDot + i);

  const arrow = 'keep-light absolute top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-gray-900 opacity-0 shadow-md transition hover:scale-105 hover:bg-white focus-visible:opacity-100 group-hover/carousel:opacity-100';

  return (
    <div
      className="group/carousel relative aspect-square overflow-hidden rounded-xl bg-gray-100"
      onPointerEnter={engage}
      onFocus={engage}
      onTouchStart={(e) => { engage(); touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {photos.map((src, i) => (
          <div key={src} className="h-full w-full shrink-0">
            {/* Only the current photo (and, once engaged, the next) is loaded. */}
            {i <= index + (engaged ? 1 : 0) && (
              <img
                srcSet={srcSetFor(src)}
                sizes={CARD_SIZES}
                loading={priority && i === 0 ? 'eager' : 'lazy'}
                fetchPriority={priority === 'high' && i === 0 ? 'high' : undefined}
                src={src}
                alt={`${alt} — photo ${i + 1}`}
                draggable={false}
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

      {index > 0 && (
        <button type="button" aria-label="Previous photo" onClick={control(-1)} className={`${arrow} left-3`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}
      {index < last && (
        <button type="button" aria-label="Next photo" onClick={control(1)} className={`${arrow} right-3`}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {photos.length > 1 && (
        <div className="keep-light pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {dots.map((i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full transition ${i === index ? 'bg-white' : 'bg-white/60'} ${
                photos.length > MAX_DOTS && (i === dots[0] || i === dots.at(-1)) && i !== index && i !== 0 && i !== last ? 'scale-75' : ''
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default PhotoCarousel
