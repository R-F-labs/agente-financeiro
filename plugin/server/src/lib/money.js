/**
 * Money helpers. Every amount inside the server is an integer number of cents.
 * Floating point values are only accepted at the boundary and converted here.
 */

const MINUS_SIGNS = /[−‒–—]/g;

/**
 * Converts a number or a Brazilian/International formatted string to integer cents.
 * Accepts: 1234.56, "1234.56", "1.234,56", "R$ 1.234,56", "-R$ 10,00", "−R$ 10,00", "- 1.234,56".
 * @param {number|string} value
 * @returns {number}
 */
export function toCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Invalid amount: ${value}`);
    return roundHalfAwayFromZero(value * 100);
  }
  if (typeof value !== 'string') throw new TypeError(`Invalid amount type: ${typeof value}`);

  let text = value.replace(MINUS_SIGNS, '-').replace(/R\$/gi, '').replace(/\s+/g, '').trim();
  if (text === '') throw new TypeError('Empty amount');

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    normalized = text.replace(/,/g, '');
  } else if (lastDot !== -1 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '');
  } else {
    normalized = text;
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new TypeError(`Invalid amount: ${value}`);
  const cents = roundHalfAwayFromZero(Number(normalized) * 100);
  return negative ? -cents : cents;
}

/**
 * @param {number} cents
 * @returns {number}
 */
export function fromCents(cents) {
  return cents / 100;
}

/**
 * Formats integer cents as Brazilian Real, e.g. "R$ 1.234,56" or "-R$ 10,00".
 * @param {number} cents
 * @returns {string}
 */
export function formatBRL(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const integer = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(abs % 100).padStart(2, '0');
  return `${sign}R$ ${integer},${decimals}`;
}

/**
 * Splits a total into `parts` integer amounts whose sum is exactly the total.
 * The remainder cents go to the first parts.
 * @param {number} totalCents
 * @param {number} parts
 * @returns {number[]}
 */
export function splitCents(totalCents, parts) {
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);
  const base = Math.floor(abs / parts);
  let remainder = abs - base * parts;
  const result = [];
  for (let i = 0; i < parts; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    result.push(sign * (base + extra));
  }
  return result;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
export function sumCents(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function roundHalfAwayFromZero(value) {
  const rounded = Math.round(Math.abs(value) + Number.EPSILON);
  return value < 0 ? -rounded : rounded;
}
