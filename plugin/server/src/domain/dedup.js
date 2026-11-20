import { hashKey, normalizeText } from '../lib/text.js';

/**
 * Computes deduplication keys for the lines of one document.
 *
 * When the bank prints the balance after each line, the key is
 * (account, date, amount, balance after). That distinguishes two identical
 * charges on the same day and recognizes the same line when statements with
 * overlapping periods are uploaded again.
 *
 * Without a running balance, the key uses the normalized description and the
 * occurrence index of that (date, amount, description) inside the document.
 *
 * @param {string} accountId
 * @param {Array<{ date: string, amountCents: number, description: string, balanceAfterCents?: number|null }>} lines
 * @returns {string[]}
 */
export function dedupKeys(accountId, lines) {
  const occurrences = new Map();
  return lines.map((line) => {
    if (typeof line.balanceAfterCents === 'number') {
      return hashKey('bal', accountId, line.date, line.amountCents, line.balanceAfterCents);
    }
    const description = normalizeText(line.description);
    const base = `${line.date}|${line.amountCents}|${description}`;
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return hashKey('desc', accountId, base, occurrence);
  });
}
