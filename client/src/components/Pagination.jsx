import React from 'react'

// Page numbers to show, Airbnb style: all of them when there are few,
// otherwise the first, the last and a window around the current page, with
// "…" for the gaps. E.g. 1 2 3 4 5 … 15 | 1 … 6 7 8 … 15 | 1 … 11 12 13 14 15
export const pageItems = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

const Chevron = ({ direction }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d={direction === 'left' ? 'M15.75 19.5 8.25 12l7.5-7.5' : 'm8.25 4.5 7.5 7.5-7.5 7.5'} />
  </svg>
)

// Numbered pagination with previous/next arrows and a result count.
const Pagination = ({ page, totalPages, total, pageSize, onPageChange, noun = 'places to stay' }) => {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const circle = 'grid h-8 w-8 place-items-center rounded-full text-sm font-semibold transition';

  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-3 py-10">
      {totalPages > 1 && (
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className={`${circle} bg-transparent hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent`}
          >
            <Chevron direction="left" />
          </button>
          {pageItems(page, totalPages).map((item, i) =>
            item === '…' ? (
              <span key={`gap-${i}`} className="w-8 text-center text-sm text-gray-500" aria-hidden="true">…</span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => item !== page && onPageChange(item)}
                className={`${circle} ${item === page ? 'bg-gray-900 text-white' : 'bg-transparent text-gray-900 hover:bg-gray-100 hover:underline'}`}
              >
                {item}
              </button>
            )
          )}
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className={`${circle} bg-transparent hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent`}
          >
            <Chevron direction="right" />
          </button>
        </div>
      )}
      <p className="text-sm text-gray-600">
        {from} – {to} of {total.toLocaleString('en-KE')} {noun}
      </p>
    </nav>
  )
}

export default Pagination
