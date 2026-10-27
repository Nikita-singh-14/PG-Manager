import { daysInMonth, monthStart, monthEnd, diffDays } from './dates.js';

/**
 * Pro-rated rent for one calendar month.
 *
 * Rules (documented in README):
 *  - Check-in day and check-out day are BOTH charged (days are inclusive).
 *  - Daily rate = monthlyRate / daysInThatMonth, so a full month always equals the monthly rate
 *    exactly and Feb is not cheaper per day than March.
 *  - Result is rounded to the nearest whole rupee, half up, using integer maths (no float drift).
 *  - checkOut === null means "still living here", so the stay runs to the end of the month.
 */
export function prorateMonth({ monthlyRate, month, checkIn, checkOut = null }) {
  const dim = daysInMonth(month);
  const first = monthStart(month);
  const last = monthEnd(month);
  const from = checkIn > first ? checkIn : first;
  const to = checkOut !== null && checkOut < last ? checkOut : last;
  const days = from > to ? 0 : diffDays(from, to) + 1;
  const amount = Math.floor((2 * monthlyRate * days + dim) / (2 * dim)); // round half up
  return { daysOccupied: days, daysInMonth: dim, amount };
}
