/**
 * Converts internal values to the shape returned to the assistant:
 * every key ending in "Cents" becomes the same key without the suffix,
 * expressed in reais (e.g. amountCents: 12345 -> amount: 123.45).
 * Internal bookkeeping keys are dropped.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function present(value) {
  if (Array.isArray(value)) return value.map(present);
  if (value === null || typeof value !== 'object') return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (HIDDEN_KEYS.has(key)) continue;
    if (key.endsWith('Cents') && (typeof child === 'number' || child === null)) {
      output[key.slice(0, -5)] = child === null ? null : child / 100;
    } else {
      output[key] = present(child);
    }
  }
  return output;
}

const HIDDEN_KEYS = new Set(['dedupKey', 'payeeKey']);
