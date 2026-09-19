// Page numbers to show, Airbnb style: all of them when there are few,
// otherwise the first, the last and a window around the current page, with
// "…" for the gaps. E.g. 1 2 3 4 5 … 15 | 1 … 6 7 8 … 15 | 1 … 11 12 13 14 15
export const pageItems = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}
