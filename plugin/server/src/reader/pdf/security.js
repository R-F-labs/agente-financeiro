import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { PdfName, PdfString } from './objects.js';
import { rc4 } from '../crypto/rc4.js';

/** Padding string used by the standard security handler (section 7.6.3.3). */
const PASSWORD_PADDING = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

/** Raised when the document is protected and the password is missing or wrong. */
export class PdfPasswordError extends Error {
  /** @param {'password_required' | 'wrong_password'} reason */
  constructor(reason) {
    super(reason === 'password_required' ? 'The PDF requires a password' : 'Wrong PDF password');
    this.name = 'PdfPasswordError';
    this.reason = reason;
  }
}

/** Raised for encryption schemes this reader does not implement. */
export class PdfUnsupportedEncryptionError extends Error {}

/**
 * Standard security handler, revisions 2 to 6: RC4 40-128 bits, AES-128 and AES-256.
 * Accepts the user (open) password or the owner password.
 */
export class StandardSecurityHandler {
  /**
   * @param {Map<string, any>} encrypt Encryption dictionary (strings not decrypted).
   * @param {Uint8Array} firstId First element of the trailer /ID array.
   * @param {string} password
   * @param {(value: any) => any} resolve
   */
  constructor(encrypt, firstId, password, resolve) {
    const filter = resolve(encrypt.get('Filter'));
    if (!(filter instanceof PdfName) || filter.value !== 'Standard') {
      throw new PdfUnsupportedEncryptionError(`Unsupported security handler: ${filter?.value ?? 'unknown'}`);
    }
    this.version = Number(resolve(encrypt.get('V')) ?? 0);
    this.revision = Number(resolve(encrypt.get('R')) ?? 0);
    this.owner = bytesOf(resolve(encrypt.get('O')));
    this.user = bytesOf(resolve(encrypt.get('U')));
    this.permissions = Number(resolve(encrypt.get('P')) ?? 0) | 0;
    this.encryptMetadata = resolve(encrypt.get('EncryptMetadata')) !== false;
    this.firstId = firstId ?? new Uint8Array(0);

    const { stringMethod, streamMethod, keyLength } = cryptMethods(encrypt, this.version, resolve);
    this.stringMethod = stringMethod;
    this.streamMethod = streamMethod;
    this.keyLength = this.revision === 2 ? 5 : keyLength;

    this.key = this.revision >= 5 ? this.authenticateAes256(password, encrypt, resolve) : this.authenticateLegacy(password);
    if (!this.key) throw new PdfPasswordError(password === '' ? 'password_required' : 'wrong_password');
  }

  /**
   * @param {Uint8Array} data
   * @param {number} num
   * @param {number} gen
   */
  decryptString(data, num, gen) {
    return this.decrypt(this.stringMethod, data, num, gen);
  }

  /**
   * @param {Uint8Array} data
   * @param {number} num
   * @param {number} gen
   */
  decryptStream(data, num, gen) {
    return this.decrypt(this.streamMethod, data, num, gen);
  }

  decrypt(method, data, num, gen) {
    if (method === 'Identity' || data.length === 0) return data;
    if (method === 'AESV3') return aesDecrypt('aes-256-cbc', this.key, data);
    const objectKey = this.objectKey(num, gen, method === 'AESV2');
    if (method === 'AESV2') return aesDecrypt('aes-128-cbc', objectKey, data);
    return rc4(objectKey, data);
  }

  /** Algorithm 1: key for one object. */
  objectKey(num, gen, aes) {
    const parts = [
      this.key,
      Uint8Array.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]),
    ];
    if (aes) parts.push(Uint8Array.from([0x73, 0x41, 0x6c, 0x54]));
    return md5(...parts).subarray(0, Math.min(this.keyLength + 5, 16));
  }

  /** Revisions 2-4: tries the password as user password, then as owner password. */
  authenticateLegacy(password) {
    const padded = padPassword(encodeLegacyPassword(password));
    const asUser = this.fileKeyFromUserPassword(padded);
    if (asUser) return asUser;
    return this.fileKeyFromUserPassword(this.userPasswordFromOwner(padded));
  }

  /** Algorithm 2 followed by the user password check (algorithms 4 and 5). */
  fileKeyFromUserPassword(padded) {
    const parts = [padded, this.owner.subarray(0, 32), int32le(this.permissions), this.firstId];
    if (this.revision >= 4 && !this.encryptMetadata) parts.push(Uint8Array.from([0xff, 0xff, 0xff, 0xff]));
    let hash = md5(...parts);
    if (this.revision >= 3) {
      for (let i = 0; i < 50; i += 1) hash = md5(hash.subarray(0, this.keyLength));
    }
    const key = hash.subarray(0, this.keyLength);
    if (this.revision === 2) {
      return equalBytes(rc4(key, PASSWORD_PADDING), this.user.subarray(0, 32)) ? key : null;
    }
    let check = rc4(key, md5(PASSWORD_PADDING, this.firstId));
    for (let i = 1; i <= 19; i += 1) check = rc4(xorKey(key, i), check);
    return equalBytes(check.subarray(0, 16), this.user.subarray(0, 16)) ? key : null;
  }

  /** Algorithm 7: recovers the padded user password from the owner password. */
  userPasswordFromOwner(paddedOwner) {
    let hash = md5(paddedOwner);
    if (this.revision >= 3) {
      for (let i = 0; i < 50; i += 1) hash = md5(hash);
    }
    const key = hash.subarray(0, this.keyLength);
    if (this.revision === 2) return rc4(key, this.owner.subarray(0, 32));
    let value = this.owner.subarray(0, 32);
    for (let i = 19; i >= 0; i -= 1) value = rc4(xorKey(key, i), value);
    return value;
  }

  /** Revisions 5 and 6 (AES-256), algorithms 2.A and 2.B. */
  authenticateAes256(password, encrypt, resolve) {
    const pass = Buffer.from(password.normalize('NFKC'), 'utf8').subarray(0, 127);
    const userHash = this.user.subarray(0, 32);
    const userValidationSalt = this.user.subarray(32, 40);
    const userKeySalt = this.user.subarray(40, 48);
    const ownerHash = this.owner.subarray(0, 32);
    const ownerValidationSalt = this.owner.subarray(32, 40);
    const ownerKeySalt = this.owner.subarray(40, 48);
    const userData = this.user.subarray(0, 48);
    const hash = (salt, extra) => (this.revision === 5 ? sha('sha256', pass, salt, extra) : hardenedHash(pass, salt, extra));

    if (equalBytes(hash(ownerValidationSalt, userData), ownerHash)) {
      return aesUnwrap(hash(ownerKeySalt, userData), bytesOf(resolve(encrypt.get('OE'))));
    }
    if (equalBytes(hash(userValidationSalt, new Uint8Array(0)), userHash)) {
      return aesUnwrap(hash(userKeySalt, new Uint8Array(0)), bytesOf(resolve(encrypt.get('UE'))));
    }
    return null;
  }
}

function cryptMethods(encrypt, version, resolve) {
  const length = Number(resolve(encrypt.get('Length')) ?? 40);
  if (version === 1 || version === 2 || version === 3) {
    return { stringMethod: 'V2', streamMethod: 'V2', keyLength: version === 1 ? 5 : Math.max(5, Math.floor(length / 8)) };
  }
  if (version !== 4 && version !== 5) throw new PdfUnsupportedEncryptionError(`Unsupported encryption version: ${version}`);
  const filters = resolve(encrypt.get('CF'));
  const method = (filterName) => {
    const name = resolve(encrypt.get(filterName));
    const value = name instanceof PdfName ? name.value : 'Identity';
    if (value === 'Identity') return { method: 'Identity' };
    const entry = filters instanceof Map ? resolve(filters.get(value)) : null;
    const cfm = entry instanceof Map ? resolve(entry.get('CFM')) : null;
    const cfmName = cfm instanceof PdfName ? cfm.value : 'None';
    let bytes = entry instanceof Map ? Number(resolve(entry.get('Length')) ?? 0) : 0;
    if (bytes > 32) bytes = Math.floor(bytes / 8);
    if (cfmName === 'None') return { method: 'Identity' };
    if (!['V2', 'AESV2', 'AESV3'].includes(cfmName)) throw new PdfUnsupportedEncryptionError(`Unsupported crypt filter: ${cfmName}`);
    return { method: cfmName, bytes };
  };
  const strings = method('StrF');
  const streams = method('StmF');
  const chosen = [strings, streams].find((item) => item.method !== 'Identity');
  let keyLength = chosen?.bytes || Math.floor(length / 8) || 16;
  if (chosen?.method === 'AESV2') keyLength = 16;
  if (chosen?.method === 'AESV3' || version === 5) keyLength = 32;
  return { stringMethod: strings.method, streamMethod: streams.method, keyLength };
}

function hardenedHash(password, salt, userData) {
  let k = sha('sha256', password, salt, userData);
  let e = new Uint8Array(0);
  for (let round = 0; round < 64 || e[e.length - 1] > round - 32; round += 1) {
    const block = Buffer.concat([password, k, userData]);
    const k1 = Buffer.alloc(block.length * 64);
    for (let i = 0; i < 64; i += 1) block.copy(k1, i * block.length);
    const cipher = createCipheriv('aes-128-cbc', k.subarray(0, 16), k.subarray(16, 32));
    cipher.setAutoPadding(false);
    e = Buffer.concat([cipher.update(k1), cipher.final()]);
    let sum = 0;
    for (let i = 0; i < 16; i += 1) sum += e[i];
    const algorithm = ['sha256', 'sha384', 'sha512'][sum % 3];
    k = sha(algorithm, e);
  }
  return k.subarray(0, 32);
}

function aesUnwrap(key, encryptedKey) {
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(encryptedKey.subarray(0, 32)), decipher.final()]);
}

function aesDecrypt(algorithm, key, data) {
  if (data.length < 16) return new Uint8Array(0);
  const iv = data.subarray(0, 16);
  const body = data.subarray(16, 16 + Math.floor((data.length - 16) / 16) * 16);
  if (body.length === 0) return new Uint8Array(0);
  try {
    const decipher = createDecipheriv(algorithm, key, iv);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    const decipher = createDecipheriv(algorithm, key, iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }
}

/** PDFDocEncoding is a superset of Latin-1 for the characters used in passwords. */
function encodeLegacyPassword(password) {
  return Buffer.from(password, [...password].every((char) => char.charCodeAt(0) <= 0xff) ? 'latin1' : 'utf8');
}

function padPassword(bytes) {
  const out = new Uint8Array(32);
  const length = Math.min(bytes.length, 32);
  out.set(bytes.subarray(0, length));
  out.set(PASSWORD_PADDING.subarray(0, 32 - length), length);
  return out;
}

function xorKey(key, value) {
  return key.map((byte) => byte ^ value);
}

function int32le(value) {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff]);
}

function md5(...parts) {
  const hash = createHash('md5');
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function sha(algorithm, ...parts) {
  const hash = createHash(algorithm);
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function bytesOf(value) {
  return value instanceof PdfString ? value.bytes : new Uint8Array(0);
}

function equalBytes(a, b) {
  if (a.length !== b.length || a.length === 0) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
