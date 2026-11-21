/**
 * RC4 stream cipher. Implemented here because OpenSSL 3 (used by Node 17+) only
 * exposes it through the legacy provider, and old PDFs still depend on it.
 * Encryption and decryption are the same operation.
 * @param {Uint8Array} key
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function rc4(key, data) {
  const state = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) state[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }
  const out = new Uint8Array(data.length);
  let a = 0;
  let b = 0;
  for (let n = 0; n < data.length; n += 1) {
    a = (a + 1) & 0xff;
    b = (b + state[a]) & 0xff;
    [state[a], state[b]] = [state[b], state[a]];
    out[n] = data[n] ^ state[(state[a] + state[b]) & 0xff];
  }
  return out;
}
