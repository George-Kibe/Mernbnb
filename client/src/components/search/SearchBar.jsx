import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router'
import { format } from 'date-fns'
import DestinationPanel from './DestinationPanel'
import DateRangeCalendar from './DateRangeCalendar'
import GuestsPanel from './GuestsPanel'
import { loadDestinations } from '../../lib/destinations'
import { EMPTY_SEARCH, datesLabel, guestsLabel, readSearch, searchParamsFor } from '../../lib/search'

const SearchIcon = ({ className = 'h-4 w-4' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
  </svg>
)

const ClearButton = ({ label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-200 hover:bg-gray-300"
  >
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="h-3 w-3"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
  </button>
)

// Airbnb's search: a compact pill ("Anywhere · Any week · Add guests") that
// opens Where / Check in / Check out / Who panels (a full-screen sheet on
// phones). Searching navigates to /?location=…&checkin=…, which the home page
// reads to filter listings.
const SearchBar = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const applied = useMemo(() => readSearch(params), [params]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null); // 'where' | 'checkIn' | 'checkOut' | 'who'
  const [draft, setDraft] = useState(applied);
  const [destinations, setDestinations] = useState([]);
  const expandedRef = useRef(null);
  const whereInput = useRef(null);

  const openAt = (section) => {
    setDraft(applied);
    setActive(section);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setActive(null);
  };
  const submit = () => {
    const query = new URLSearchParams(searchParamsFor(draft)).toString();
    close();
    navigate(query ? `/?${query}` : '/');
  };

  useEffect(() => {
    if (open) loadDestinations().then(setDestinations);
  }, [open]);

  // Desktop: close on Escape or a click outside the expanded bar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const onDown = (e) => {
      if (window.matchMedia('(min-width: 768px)').matches && !expandedRef.current?.contains(e.target)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open && active === 'where' && window.matchMedia('(min-width: 768px)').matches) whereInput.current?.focus();
  }, [open, active]);

  // After check-in, move on to check-out; once both are set the calendar
  // stays open (as on Airbnb) until another section is picked.
  const setDates = ({ checkIn, checkOut }) => {
    setDraft((d) => ({ ...d, checkIn, checkOut }));
    setActive('checkOut');
  };
  const pickDestination = (name) => {
    setDraft((d) => ({ ...d, location: name }));
    setActive('checkIn');
  };

  const dateText = (date) => (date ? format(date, 'MMM d') : null);
  const section = (name) =>
    `relative flex min-w-0 cursor-pointer items-center rounded-full py-3.5 text-left transition ${
      active === name ? 'bg-white shadow-lg' : 'bg-transparent hover:bg-gray-200/70'
    }`;
  const divider = (left, right) => (
    <span className={`h-8 w-px shrink-0 self-center bg-gray-300 ${active === left || active === right ? 'invisible' : ''}`} />
  );
  const datesActive = active === 'checkIn' || active === 'checkOut';
  // Sections hold their own buttons (clear, search), so they can't be
  // <button>s themselves; make them keyboard-operable divs instead.
  const sectionButton = (onActivate) => ({
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onActivate();
      }
    },
  });

  return (
    <>
      {/* Collapsed pill (desktop) */}
      <div className={`hidden items-center rounded-full border border-gray-200 py-2 pl-6 pr-2 shadow-md transition hover:shadow-lg md:flex ${open ? 'invisible' : ''}`}>
        <button type="button" onClick={() => openAt('where')} className="max-w-40 truncate bg-transparent pr-4 text-sm font-semibold">
          {applied.location || 'Anywhere'}
        </button>
        <span className="h-6 w-px bg-gray-300" />
        <button type="button" onClick={() => openAt('checkIn')} className="whitespace-nowrap bg-transparent px-4 text-sm font-semibold">
          {datesLabel(applied) ?? 'Any week'}
        </button>
        <span className="h-6 w-px bg-gray-300" />
        <button type="button" onClick={() => openAt('who')} className={`whitespace-nowrap bg-transparent px-4 text-sm ${guestsLabel(applied) ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {guestsLabel(applied) ?? 'Add guests'}
        </button>
        <button type="button" aria-label="Search" onClick={() => openAt('where')} className="grid h-8 w-8 place-items-center rounded-full bg-primary text-on-primary">
          <SearchIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Collapsed pill (phones) */}
      <button type="button" onClick={() => openAt('where')} className="flex w-full items-center gap-4 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-left shadow-md md:hidden">
        <SearchIcon className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{applied.location || 'Where to?'}</span>
          <span className="block truncate text-xs text-gray-500">
            {[datesLabel(applied) ?? 'Any week', guestsLabel(applied) ?? 'Add guests'].join(' · ')}
          </span>
        </span>
      </button>

      {open && createPortal(<div className="fixed inset-0 z-30 hidden bg-black/25 md:block" aria-hidden="true" />, document.body)}

      {/* Expanded bar (desktop), drawn just below the header row */}
      {open && (
        <div className="absolute inset-x-0 top-full hidden bg-white px-4 pb-6 pt-1 shadow-sm md:block">
          <div
            ref={expandedRef}
            role="search"
            className={`relative mx-auto flex max-w-212.5 items-stretch rounded-full border border-gray-200 shadow-md ${active ? 'bg-gray-100' : 'bg-white'}`}
          >
            <div className={`${section('where')} flex-[1.1] gap-2 pl-8 pr-4`} onClick={() => { setActive('where'); whereInput.current?.focus(); }}>
              <div className="min-w-0 flex-1">
                <label htmlFor="search-where" className="block text-xs font-semibold">Where</label>
                <input
                  id="search-where"
                  ref={whereInput}
                  type="text"
                  autoComplete="off"
                  value={draft.location}
                  onFocus={() => setActive('where')}
                  onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                  placeholder="Search destinations"
                  className="m-0 w-full truncate rounded-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-gray-500"
                />
              </div>
              {active === 'where' && draft.location && (
                <ClearButton label="Clear destination" onClick={() => setDraft((d) => ({ ...d, location: '' }))} />
              )}
            </div>
            {divider('where', 'checkIn')}
            <div {...sectionButton(() => setActive('checkIn'))} className={`${section('checkIn')} flex-[0.9] gap-2 px-6`}>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">Check in</span>
                <span className={`block truncate text-sm ${draft.checkIn ? 'font-semibold' : 'text-gray-500'}`}>{dateText(draft.checkIn) ?? 'Add dates'}</span>
              </span>
              {active === 'checkIn' && draft.checkIn && (
                <ClearButton label="Clear dates" onClick={() => setDraft((d) => ({ ...d, checkIn: null, checkOut: null }))} />
              )}
            </div>
            {divider('checkIn', 'checkOut')}
            <div {...sectionButton(() => setActive(draft.checkIn ? 'checkOut' : 'checkIn'))} className={`${section('checkOut')} flex-[0.9] gap-2 px-6`}>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">Check out</span>
                <span className={`block truncate text-sm ${draft.checkOut ? 'font-semibold' : 'text-gray-500'}`}>{dateText(draft.checkOut) ?? 'Add dates'}</span>
              </span>
              {active === 'checkOut' && draft.checkOut && (
                <ClearButton label="Clear check-out date" onClick={() => setDraft((d) => ({ ...d, checkOut: null }))} />
              )}
            </div>
            {divider('checkOut', 'who')}
            <div {...sectionButton(() => setActive('who'))} className={`${section('who')} flex-[2.1] gap-2 pl-6 pr-2`}>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold">Who</span>
                <span className={`block truncate text-sm ${guestsLabel(draft) ? 'font-semibold' : 'text-gray-500'}`}>{guestsLabel(draft) ?? 'Add guests'}</span>
              </span>
              {active === 'who' && guestsLabel(draft) && (
                <ClearButton label="Clear guests" onClick={() => setDraft((d) => ({ ...d, adults: 0, children: 0, infants: 0, pets: 0 }))} />
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); submit(); }}
                className="flex h-12 items-center gap-2 rounded-full bg-primary px-4 font-semibold text-on-primary transition hover:bg-primary-hover"
              >
                <SearchIcon />
                Search
              </button>
            </div>

            {active === 'where' && (
              <div className="absolute left-0 top-full z-10 mt-3 w-104 rounded-4xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-gray-50 dark:ring-white/10">
                <DestinationPanel destinations={destinations} query={draft.location} onPick={pickDestination} />
              </div>
            )}
            {datesActive && (
              <div className="absolute inset-x-0 top-full z-10 mt-3 rounded-4xl bg-white px-10 pb-6 pt-8 shadow-2xl ring-1 ring-black/5 dark:bg-gray-50 dark:ring-white/10">
                <DateRangeCalendar checkIn={draft.checkIn} checkOut={draft.checkOut} onChange={setDates} />
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => setDraft((d) => ({ ...d, checkIn: null, checkOut: null }))} className="rounded-lg bg-transparent px-3 py-2 text-sm font-semibold underline hover:bg-gray-100">
                    Clear dates
                  </button>
                </div>
              </div>
            )}
            {active === 'who' && (
              <div className="absolute right-0 top-full z-10 mt-3 w-104 rounded-4xl bg-white p-8 shadow-2xl ring-1 ring-black/5 dark:bg-gray-50 dark:ring-white/10">
                <GuestsPanel search={draft} onChange={setDraft} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-screen sheet (phones) */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Search" className="fixed inset-0 z-50 flex flex-col bg-gray-50 md:hidden">
          <div className="flex items-center px-4 pt-4">
            <button type="button" aria-label="Close search" onClick={close} className="grid h-9 w-9 place-items-center rounded-full border border-gray-300 bg-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {[
              {
                key: 'where', title: 'Where to?', label: 'Where', value: draft.location || "I'm flexible",
                body: (
                  <>
                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-300 px-4">
                      <SearchIcon className="h-4 w-4 shrink-0" />
                      <input
                        type="text"
                        aria-label="Search destinations"
                        autoComplete="off"
                        value={draft.location}
                        onChange={(e) => setDraft((d) => ({ ...d, location: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                        placeholder="Search destinations"
                        className="m-0 rounded-none border-0 bg-transparent px-0 py-3.5 text-sm outline-none"
                      />
                    </div>
                    <DestinationPanel destinations={destinations} query={draft.location} onPick={pickDestination} />
                  </>
                ),
              },
              {
                key: 'dates', title: 'When’s your trip?', label: 'When', value: datesLabel(draft) ?? 'Add dates',
                body: <DateRangeCalendar months={1} checkIn={draft.checkIn} checkOut={draft.checkOut} onChange={setDates} />,
              },
              {
                key: 'who', title: 'Who’s coming?', label: 'Who', value: guestsLabel(draft) ?? 'Add guests',
                body: <GuestsPanel search={draft} onChange={setDraft} />,
              },
            ].map((card) => {
              const isOpen = card.key === 'dates' ? datesActive : active === card.key;
              return isOpen ? (
                <section key={card.key} className="rounded-3xl bg-white p-5 shadow-lg">
                  <h2 className="mb-4 text-2xl font-bold">{card.title}</h2>
                  {card.body}
                </section>
              ) : (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setActive(card.key === 'dates' ? 'checkIn' : card.key)}
                  className="flex w-full items-center justify-between rounded-2xl bg-white px-5 py-4 text-sm shadow-sm"
                >
                  <span className="text-gray-500">{card.label}</span>
                  <span className="font-semibold">{card.value}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-4">
            <button type="button" onClick={() => setDraft(EMPTY_SEARCH)} className="bg-transparent font-semibold underline">Clear all</button>
            <button type="button" onClick={submit} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary hover:bg-primary-hover">
              <SearchIcon />
              Search
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SearchBar
