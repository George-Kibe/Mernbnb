import React from 'react'

const MAX_SUGGESTIONS = 6;

// Suggested destinations (from GET /api/places/destinations), filtered by
// what's typed in the "Where" field.
const DestinationPanel = ({ destinations, query, onPick }) => {
  const text = query.trim().toLowerCase();
  const matches = (text
    ? destinations.filter((d) => d.name.toLowerCase().includes(text))
    : destinations
  ).slice(0, MAX_SUGGESTIONS);

  return (
    <div>
      <p className="mb-2 px-2 text-xs font-semibold text-gray-600">
        {text ? 'Destinations' : 'Suggested destinations'}
      </p>
      {matches.length === 0 ? (
        <p className="px-2 py-3 text-sm text-gray-500">
          {destinations.length ? `No stays match “${query.trim()}” yet. Search anyway to try it.` : 'Loading destinations…'}
        </p>
      ) : (
        <ul role="listbox" aria-label="Destinations">
          {matches.map((d) => (
            <li key={d.name}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(d.name)}
                className="flex w-full items-center gap-4 rounded-xl bg-transparent px-2 py-2 text-left hover:bg-gray-100"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path fillRule="evenodd" d="m11.54 22.351.07.04.028.016a.76.76 0 0 0 .723 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742ZM12 13.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" /></svg>
                </span>
                <span>
                  <span className="block font-medium">{d.name}</span>
                  <span className="block text-sm text-gray-500">{d.count} {d.count === 1 ? 'stay' : 'stays'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DestinationPanel
