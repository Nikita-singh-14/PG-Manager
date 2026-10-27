// All dates are 'YYYY-MM-DD' strings; months are 'YYYY-MM'. Arithmetic is done in UTC so
// daylight-saving or server timezone can never shift a day.
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const pad = (n) => String(n).padStart(2, '0');

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
export const isValidMonth = (s) => typeof s === 'string' && MONTH_RE.test(s);

const utc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const addDays = (s, n) => new Date(utc(s) + n * 86400000).toISOString().slice(0, 10);
export const monthOf = (date) => date.slice(0, 7);
export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthStart = (month) => `${month}-01`;
export const monthEnd = (month) => `${month}-${pad(daysInMonth(month))}`;
export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
export function monthsBetween(from, to) {
  const out = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}
export const dueDateFor = (month, dueDay) => `${month}-${pad(dueDay)}`;

/** "Today" in the configured timezone as YYYY-MM-DD. */
export function todayIn(timeZone) {
  return new Date().toLocaleDateString('en-CA', { timeZone });
}
export const OPEN_END = '9999-12-31'; // end date of a stay with no check-out yet
