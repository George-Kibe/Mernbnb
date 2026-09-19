import React from 'react'
import { setGuestCount } from '../../lib/search'

const ROWS = [
  { type: 'adults', label: 'Adults', hint: 'Ages 13 or above' },
  { type: 'children', label: 'Children', hint: 'Ages 2–12' },
  { type: 'infants', label: 'Infants', hint: 'Under 2' },
  { type: 'pets', label: 'Pets', hint: 'Only shows stays that allow pets' },
];

const Stepper = ({ label, onClick, disabled, children }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="grid h-8 w-8 place-items-center rounded-full border border-gray-400 bg-white text-gray-700 transition hover:border-gray-900 hover:text-gray-900 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-200"
  >
    {children}
  </button>
)

// Airbnb's "Who" panel: counters for adults, children, infants and pets.
const GuestsPanel = ({ search, onChange }) => (
  <div className="divide-y divide-gray-200">
    {ROWS.map(({ type, label, hint }) => {
      const value = search[type];
      const decreased = setGuestCount(search, type, value - 1);
      const increased = setGuestCount(search, type, value + 1);
      return (
        <div key={type} className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
          <div>
            <p className="font-semibold">{label}</p>
            <p className="text-sm text-gray-500">{hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <Stepper label={`Decrease ${label.toLowerCase()}`} disabled={value === 0 || decreased === search} onClick={() => onChange(decreased)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" d="M5 12h14" /></svg>
            </Stepper>
            <span className="w-5 text-center tabular-nums" aria-label={`${value} ${label.toLowerCase()}`}>{value}</span>
            <Stepper label={`Increase ${label.toLowerCase()}`} disabled={increased === search} onClick={() => onChange(increased)}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
            </Stepper>
          </div>
        </div>
      );
    })}
  </div>
)

export default GuestsPanel
