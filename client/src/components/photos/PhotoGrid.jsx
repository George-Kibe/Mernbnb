import React, { useState } from 'react'
import { COVER_SIZES, srcSetFor } from '../../lib/images'

// Tile classes for the desktop grid (4 columns x 2 rows): one large photo on
// the left and up to four on the right, adapting when there are fewer.
const LAYOUTS = {
  1: ['col-span-4 row-span-2'],
  2: ['col-span-2 row-span-2', 'col-span-2 row-span-2'],
  3: ['col-span-2 row-span-2', 'col-span-2', 'col-span-2'],
  4: ['col-span-2 row-span-2', 'col-span-2', 'col-span-1', 'col-span-1'],
  5: ['col-span-2 row-span-2', 'col-span-1', 'col-span-1', 'col-span-1', 'col-span-1'],
};

// The cover photo is the page's largest image, so it loads first. Both
// layouts use the same srcset and sizes for it, so the browser fetches it
// once whichever is shown; the other photos load lazily (the hidden layout's
// never do). `src` comes last so the browser sees srcset, sizes and loading
// before it starts a download.
const coverProps = (src) => ({ srcSet: srcSetFor(src), sizes: COVER_SIZES, loading: 'eager', fetchPriority: 'high' });
const tileProps = (src) => ({ srcSet: srcSetFor(src), sizes: '(min-width: 768px) 25vw, 100vw', loading: 'lazy' });

// Listing-page photo header. onOpen(index) opens the photo tour.
const PhotoGrid = ({ photos = [], title, onOpen }) => {
  const [mobileIndex, setMobileIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[2/1] place-items-center rounded-xl bg-gray-100 text-gray-500">
        No photos yet
      </div>
    );
  }

  const shown = photos.slice(0, 5);
  const layout = LAYOUTS[shown.length];

  return (
    <div className="relative">
      {/* Desktop: Airbnb's 1 + 4 grid */}
      <div className="hidden h-[min(60vh,32rem)] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl md:grid">
        {shown.map((src, i) => (
          <button key={src} type="button" onClick={() => onOpen(i)} className={`overflow-hidden bg-gray-100 p-0 ${layout[i]}`}>
            <img {...(i === 0 ? coverProps(src) : tileProps(src))} src={src} alt={`${title} — photo ${i + 1}`} className="h-full w-full object-cover transition hover:brightness-90" />
          </button>
        ))}
      </div>

      {/* Mobile: swipeable strip with a counter */}
      <div
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-xl scrollbar-none md:hidden"
        onScroll={(e) => setMobileIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {photos.map((src, i) => (
          <button key={src} type="button" onClick={() => onOpen(i)} className="h-full w-full shrink-0 snap-center bg-gray-100 p-0">
            <img {...(i === 0 ? coverProps(src) : { ...tileProps(src), sizes: '100vw' })} src={src} alt={`${title} — photo ${i + 1}`} className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <span className="keep-light pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white tabular-nums md:hidden">
        {mobileIndex + 1} / {photos.length}
      </span>

      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="absolute bottom-4 right-4 hidden items-center gap-2 rounded-lg border border-gray-900 bg-white px-4 py-1.5 text-sm font-semibold shadow-sm hover:bg-gray-100 md:flex"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            {[1, 6.5, 12].flatMap((y) => [1, 6.5, 12].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.5" />))}
          </svg>
          Show all photos
        </button>
      )}
    </div>
  )
}

export default PhotoGrid
