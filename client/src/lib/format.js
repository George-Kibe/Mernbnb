import { differenceInCalendarDays, format } from "date-fns";

// Booking dates are stored at UTC midnight. Rebuild them as local dates from
// their UTC parts so they show the same calendar day in every time zone.
export const utcDay = (value) => {
  const date = new Date(value);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

export const formatDay = (value, pattern = "EEE, MMM d, yyyy") => format(utcDay(value), pattern);

export const nightsBetween = (checkIn, checkOut) => differenceInCalendarDays(utcDay(checkOut), utcDay(checkIn));

export const formatPrice = (amount) => `Kshs. ${Number(amount).toLocaleString("en-KE")}`;
