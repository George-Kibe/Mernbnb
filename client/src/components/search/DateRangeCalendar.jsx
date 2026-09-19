import React, { useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, format, getDay, isAfter, isBefore, isSameDay, startOfDay, startOfMonth,
} from 'date-fns'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Airbnb-style range picker. The first click picks check-in, the second
// check-out; clicking again (or before check-in) starts over.
// onChange({ checkIn, checkOut }) fires on every click.
const DateRangeCalendar = ({ checkIn, checkOut, onChange, months = 2 }) => {
  const today = startOfDay(new Date());
  const [firstMonth, setFirstMonth] = useState(startOfMonth(checkIn ?? today));
  const [hovered, setHovered] = useState(null);
  const choosingCheckOut = checkIn && !checkOut;
  const rangeEnd = checkOut ?? (choosingCheckOut && hovered && isAfter(hovered, checkIn) ? hovered : null);

  const pick = (day) => {
    if (!checkIn || checkOut || !isAfter(day, checkIn)) onChange({ checkIn: day, checkOut: null });
    else onChange({ checkIn, checkOut: day });
  };

  const arrow = 'grid h-8 w-8 place-items-center rounded-full bg-transparent hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent';

  return (
    <div className="relative select-none">
      <button type="button" aria-label="Previous month" disabled={!isAfter(firstMonth, startOfMonth(today))} onClick={() => setFirstMonth((m) => addMonths(m, -1))} className={`${arrow} absolute left-0 top-0`}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
      </button>
      <button type="button" aria-label="Next month" onClick={() => setFirstMonth((m) => addMonths(m, 1))} className={`${arrow} absolute right-0 top-0`}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
      </button>

      <div className={`grid gap-8 ${months === 2 ? 'md:grid-cols-2' : ''}`} onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: months }, (_, i) => addMonths(firstMonth, i)).map((month, i) => {
          const days = eachDayOfInterval({ start: month, end: endOfMonth(month) });
          return (
            <div key={month.toISOString()} className={i > 0 ? 'hidden md:block' : ''}>
              <p className="mb-4 h-8 text-center font-semibold leading-8">{format(month, 'MMMM yyyy')}</p>
              <div className="grid grid-cols-7 text-center text-xs font-semibold text-gray-500">
                {WEEKDAYS.map((d) => <span key={d} className="pb-2">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: getDay(month) }, (_, k) => <span key={`pad-${k}`} />)}
                {days.map((day) => {
                  const past = isBefore(day, today);
                  const isStart = checkIn && isSameDay(day, checkIn);
                  const isEnd = rangeEnd && isSameDay(day, rangeEnd);
                  const inRange = checkIn && rangeEnd && isAfter(day, checkIn) && isBefore(day, rangeEnd);
                  // Grey band behind the range, rounded at its ends.
                  const band = inRange
                    ? 'bg-gray-100'
                    : isStart && rangeEnd
                      ? 'bg-linear-to-r from-transparent from-50% to-gray-100 to-50%'
                      : isEnd && checkIn
                        ? 'bg-linear-to-l from-transparent from-50% to-gray-100 to-50%'
                        : '';
                  return (
                    <div key={day.toISOString()} className={band}>
                      <button
                        type="button"
                        disabled={past}
                        aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                        aria-pressed={Boolean(isStart || isEnd)}
                        onClick={() => pick(day)}
                        onMouseEnter={() => setHovered(day)}
                        className={`mx-auto grid h-10 w-10 place-items-center rounded-full text-sm font-semibold transition ${
                          isStart || isEnd
                            ? 'bg-gray-900 text-white'
                            : past
                              ? 'cursor-not-allowed bg-transparent text-gray-300 line-through'
                              : 'bg-transparent hover:ring-1 hover:ring-gray-900'
                        } ${isSameDay(day, today) && !isStart && !isEnd ? 'underline underline-offset-4' : ''}`}
                      >
                        {format(day, 'd')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  )
}

export default DateRangeCalendar
