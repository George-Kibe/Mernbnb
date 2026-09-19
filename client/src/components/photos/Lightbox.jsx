import React, { useEffect, useRef, useState } from 'react'

// Full-screen, one-photo-at-a-time viewer (arrows, ←/→/Esc, swipe).
const Lightbox = ({ photos, startIndex = 0, title, onClose }) => {
  const [index, setIndex] = useState(startIndex);
  const touchStartX = useRef(null);
  const last = photos.length - 1;
  const go = (delta) => setIndex((i) => Math.min(Math.max(i + delta, 0), last));

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Warm the cache for the neighbours so paging feels instant.
  useEffect(() => {
    [photos[index - 1], photos[index + 1]].filter(Boolean).forEach((src) => {
      new Image().src = src;
    });
  }, [index, photos]);

  const arrow = 'absolute top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/40 text-white transition hover:bg-white/15';

  return (
    <div role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} of ${photos.length}`} className="keep-light fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-sm font-semibold text-white hover:bg-white/10">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          Close
        </button>
        <span className="text-sm tabular-nums">{index + 1} / {photos.length}</span>
        <span className="hidden w-24 truncate text-right text-sm text-white/70 md:block">{title}</span>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-10 md:px-28"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchStartX.current = null;
        }}
      >
        <img key={index} src={photos[index]} alt={`${title} — photo ${index + 1}`} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {index > 0 && (
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className={`${arrow} left-4 md:left-8`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {index < last && (
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className={`${arrow} right-4 md:right-8`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default Lightbox
