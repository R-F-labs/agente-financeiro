/**
 * Date helpers working with ISO calendar dates (YYYY-MM-DD) as plain strings,
 * so no timezone conversion ever shifts a business date.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isIsoDate(value) {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * @param {string} iso
 * @returns {Date}
 */
export function toUtcDate(iso) {
  if (!isIsoDate(iso)) throw new TypeError(`Invalid ISO date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function fromUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * @param {string} iso
 * @param {number} days
 * @returns {string}
 */
export function addDays(iso, days) {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtcDate(date);
}

/**
 * Adds months keeping the day when possible and clamping to the month end.
 * @param {string} iso
 * @param {number} months
 * @returns {string}
 */
export function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return fromUtcDate(target);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} b - a in days
 */
export function diffDays(a, b) {
  return Math.round((toUtcDate(b).getTime() - toUtcDate(a).getTime()) / 86_400_000);
}

/**
 * @param {string} iso
 * @returns {string} YYYY-MM
 */
export function monthOf(iso) {
  return iso.slice(0, 7);
}

/**
 * @param {string} month YYYY-MM
 * @returns {{ start: string, end: string }}
 */
export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = fromUtcDate(new Date(Date.UTC(y, m - 1, 1)));
  const end = fromUtcDate(new Date(Date.UTC(y, m, 0)));
  return { start, end };
}

/**
 * @param {string} month YYYY-MM
 * @param {number} delta
 * @returns {string}
 */
export function shiftMonth(month, delta) {
  return addMonths(`${month}-01`, delta).slice(0, 7);
}

/**
 * Lists the YYYY-MM months touched by an inclusive date range.
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function monthsBetween(start, end) {
  const months = [];
  let current = monthOf(start);
  const last = monthOf(end);
  while (current <= last) {
    months.push(current);
    current = shiftMonth(current, 1);
  }
  return months;
}

/**
 * Today in the local timezone as YYYY-MM-DD.
 * @returns {string}
 */
export function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Brazilian national holidays for a year, including the movable ones based on Easter.
 * @param {number} year
 * @returns {Set<string>}
 */
export function brazilianHolidays(year) {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];
  const easter = easterSunday(year);
  const movable = [
    addDays(easter, -48), // Carnival Monday
    addDays(easter, -47), // Carnival Tuesday
    addDays(easter, -2), // Good Friday
    addDays(easter, 60), // Corpus Christi
  ];
  return new Set([...fixed.map((md) => `${year}-${md}`), ...movable]);
}

/**
 * @param {string} iso
 * @returns {boolean}
 */
export function isBusinessDay(iso) {
  const weekday = toUtcDate(iso).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !brazilianHolidays(Number(iso.slice(0, 4))).has(iso);
}

/**
 * Number of business days strictly after `a` up to and including `b` (absolute value).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function businessDaysBetween(a, b) {
  const [from, to] = a <= b ? [a, b] : [b, a];
  let count = 0;
  let cursor = from;
  while (cursor < to) {
    cursor = addDays(cursor, 1);
    if (isBusinessDay(cursor)) count += 1;
  }
  return count;
}

function easterSunday(year) {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
