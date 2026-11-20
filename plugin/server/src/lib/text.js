import { createHash } from 'node:crypto';

/**
 * Normalizes free text for matching: uppercase, no accents, single spaces.
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9*&./ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a stable matching key for a payee, removing common acquirer prefixes
 * ("PAG*", "DL *", "EBN*", "MP *", "PTY*") and installment suffixes.
 * @param {string} value
 * @returns {string}
 */
export function payeeKey(value) {
  return normalizeText(value)
    .replace(/\s*-\s*PARCELA\s+\d+\s*\/\s*\d+$/, '')
    .replace(/\s+\d{1,2}\s*\/\s*\d{1,2}$/, '')
    .replace(/^(PAG|DL|EBN|MP|PTY|PG|IFD|EC|SUMUP|STONE|CIELO)\s*\*\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {...unknown} parts
 * @returns {string}
 */
export function hashKey(...parts) {
  return createHash('sha256').update(parts.map((part) => String(part)).join('|')).digest('hex').slice(0, 32);
}

/**
 * Short random identifier with a readable prefix, e.g. "acc_k3j9x2".
 * @param {string} prefix
 * @returns {string}
 */
export function newId(prefix) {
  const random = createHash('sha256')
    .update(`${Date.now()}-${Math.random()}-${process.hrtime.bigint()}`)
    .digest('base64url')
    .slice(0, 10)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, 'x');
  return `${prefix}_${random}`;
}
