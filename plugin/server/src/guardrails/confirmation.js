import { createHash, randomBytes } from 'node:crypto';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 100;

/**
 * Two-step confirmation for sensitive operations. The first call returns a summary and
 * a one-time token bound to the exact arguments; the operation only runs when the same
 * tool is called again with the same arguments and that token, after the user agreed.
 */
export class ConfirmationGate {
  /**
   * @param {{ ttlMs?: number, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
    /** @type {Map<string, { fingerprint: string, expiresAt: number }>} */
    this.pending = new Map();
  }

  /**
   * Issues a token for this tool call.
   * @param {string} tool
   * @param {Record<string, unknown>} args
   */
  issue(tool, args) {
    this.prune();
    const token = randomBytes(9).toString('base64url');
    this.pending.set(token, { fingerprint: fingerprint(tool, args), expiresAt: this.now() + this.ttlMs });
    return token;
  }

  /**
   * Consumes the token when it matches the call. Tokens are single use.
   * @param {string} tool
   * @param {Record<string, unknown>} args
   * @param {unknown} token
   */
  consume(tool, args, token) {
    if (typeof token !== 'string') return false;
    const entry = this.pending.get(token);
    if (!entry) return false;
    this.pending.delete(token);
    return entry.expiresAt >= this.now() && entry.fingerprint === fingerprint(tool, args);
  }

  prune() {
    const now = this.now();
    for (const [token, entry] of this.pending) if (entry.expiresAt < now) this.pending.delete(token);
    while (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value);
  }
}

/**
 * Stable hash of the tool name and its arguments, ignoring the token itself.
 * @param {string} tool
 * @param {Record<string, unknown>} args
 */
export function fingerprint(tool, args) {
  const { confirmation_token: _ignored, ...rest } = args ?? {};
  return createHash('sha256').update(`${tool}\n${canonicalJson(rest)}`).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
