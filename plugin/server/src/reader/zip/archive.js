import { createCipheriv, createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { crc32 } from '../../export/zip.js';

/** Limits that protect against oversized or malicious archives ("zip bombs"). */
export const ZIP_LIMITS = Object.freeze({
  maxEntries: 200,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
});

/** Raised when the archive is protected and the password is missing or wrong. */
export class ZipPasswordError extends Error {
  /** @param {'password_required' | 'wrong_password'} reason */
  constructor(reason) {
    super(reason === 'password_required' ? 'The ZIP requires a password' : 'Wrong ZIP password');
    this.name = 'ZipPasswordError';
    this.reason = reason;
  }
}

/** Raised for damaged archives and unsupported features. */
export class ZipFormatError extends Error {}

/**
 * @typedef {Object} ZipEntry
 * @property {string} name
 * @property {number} size Uncompressed size declared in the archive.
 * @property {boolean} encrypted
 * @property {'zipcrypto' | 'aes' | null} encryption
 * @property {boolean} directory
 */

/**
 * Reads ZIP archives (stored and deflated entries), including password protection
 * with the traditional PKWARE cipher ("ZipCrypto") and WinZip AES (AE-1 and AE-2).
 */
export class ZipArchive {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    /** @type {(ZipEntry & { offset: number, method: number, flags: number, crc: number, compressedSize: number, modTime: number, aes?: { strength: number, method: number, version: number } })[]} */
    this.entries = readCentralDirectory(this.bytes);
  }

  /** @returns {ZipEntry[]} */
  list() {
    return this.entries.map(({ name, size, encrypted, encryption, directory }) => ({ name, size, encrypted, encryption, directory }));
  }

  get encrypted() {
    return this.entries.some((entry) => entry.encrypted);
  }

  /**
   * Extracts one entry.
   * @param {string} name
   * @param {string} [password]
   * @returns {Buffer}
   */
  read(name, password = '') {
    const entry = this.entries.find((candidate) => candidate.name === name);
    if (!entry) throw new ZipFormatError(`Entry not found: ${name}`);
    if (entry.size > ZIP_LIMITS.maxEntryBytes) throw new ZipFormatError(`Entry too large: ${name}`);
    const { bytes } = this;
    const local = entry.offset;
    if (bytes.readUInt32LE(local) !== 0x04034b50) throw new ZipFormatError('Damaged ZIP (local header)');
    const nameLength = bytes.readUInt16LE(local + 26);
    const extraLength = bytes.readUInt16LE(local + 28);
    const start = local + 30 + nameLength + extraLength;
    let data = bytes.subarray(start, start + entry.compressedSize);
    let method = entry.method;
    let checkCrc = true;

    if (entry.encrypted) {
      if (password === '') throw new ZipPasswordError('password_required');
      if (entry.encryption === 'aes') {
        data = decryptAes(data, password, entry.aes.strength);
        method = entry.aes.method;
        checkCrc = entry.aes.version === 1;
      } else {
        data = decryptZipCrypto(data, password, entry);
      }
    }

    let output;
    if (method === 0) output = Buffer.from(data);
    else if (method === 8) {
      try {
        output = inflateRawSync(data, { maxOutputLength: ZIP_LIMITS.maxEntryBytes });
      } catch (error) {
        if (entry.encrypted) throw new ZipPasswordError('wrong_password');
        throw new ZipFormatError(`Damaged entry ${name}: ${error.message}`);
      }
    } else throw new ZipFormatError(`Unsupported compression method ${method} in ${name}`);

    if (checkCrc && crc32(output) !== entry.crc) {
      if (entry.encrypted) throw new ZipPasswordError('wrong_password');
      throw new ZipFormatError(`Checksum mismatch in ${name}`);
    }
    return output;
  }
}

function readCentralDirectory(bytes) {
  const end = findEndOfCentralDirectory(bytes);
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  const offset = bytes.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new ZipFormatError('ZIP64 archives are not supported');
  if (count > ZIP_LIMITS.maxEntries) throw new ZipFormatError(`Too many entries in the archive (${count})`);
  if (offset + size > bytes.length) throw new ZipFormatError('Damaged ZIP (central directory)');
  const entries = [];
  let position = offset;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (bytes.readUInt32LE(position) !== 0x02014b50) throw new ZipFormatError('Damaged ZIP (central directory entry)');
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    const modTime = bytes.readUInt16LE(position + 12);
    const crc = bytes.readUInt32LE(position + 16);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const uncompressedSize = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    const extraLength = bytes.readUInt16LE(position + 30);
    const commentLength = bytes.readUInt16LE(position + 32);
    const localOffset = bytes.readUInt32LE(position + 42);
    const rawName = bytes.subarray(position + 46, position + 46 + nameLength);
    const extra = bytes.subarray(position + 46 + nameLength, position + 46 + nameLength + extraLength);
    const name = (flags & 0x800) !== 0 ? rawName.toString('utf8') : decodeLegacyName(rawName);
    const encrypted = (flags & 1) !== 0;
    const aes = method === 99 ? readAesExtra(extra) : undefined;
    if (method === 99 && !aes) throw new ZipFormatError(`Damaged AES entry: ${name}`);
    total += uncompressedSize;
    if (total > ZIP_LIMITS.maxTotalBytes) throw new ZipFormatError('Archive content is too large');
    entries.push({
      name,
      size: uncompressedSize,
      encrypted,
      encryption: encrypted ? (aes ? 'aes' : 'zipcrypto') : null,
      directory: name.endsWith('/'),
      offset: localOffset,
      method,
      flags,
      crc,
      compressedSize,
      modTime,
      aes,
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(bytes) {
  const lowest = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= lowest; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new ZipFormatError('Not a ZIP file');
}

/** Names without the UTF-8 flag are CP437 in the spec; in practice they are ASCII or UTF-8. */
function decodeLegacyName(raw) {
  const utf8 = raw.toString('utf8');
  return utf8.includes('�') ? raw.toString('latin1') : utf8;
}

function readAesExtra(extra) {
  let position = 0;
  while (position + 4 <= extra.length) {
    const id = extra.readUInt16LE(position);
    const size = extra.readUInt16LE(position + 2);
    if (id === 0x9901 && size >= 7) {
      return {
        version: extra.readUInt16LE(position + 4),
        strength: extra[position + 8],
        method: extra.readUInt16LE(position + 9),
      };
    }
    position += 4 + size;
  }
  return undefined;
}

function passwordBytes(password) {
  return Buffer.from(password, [...password].every((char) => char.charCodeAt(0) <= 0xff) ? 'latin1' : 'utf8');
}

/** Traditional PKWARE encryption (APPNOTE section 6.1). */
function decryptZipCrypto(data, password, entry) {
  if (data.length < 12) throw new ZipFormatError(`Damaged encrypted entry: ${entry.name}`);
  const keys = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
  const update = (byte) => {
    keys[0] = crcByte(keys[0], byte);
    keys[1] = (Math.imul((keys[1] + (keys[0] & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    keys[2] = crcByte(keys[2], keys[1] >>> 24);
  };
  for (const byte of passwordBytes(password)) update(byte);
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const temp = (keys[2] | 2) & 0xffff;
    const plain = data[i] ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    out[i] = plain;
    update(plain);
  }
  const check = out[11];
  const expected = (entry.flags & 0x8) !== 0 ? (entry.modTime >>> 8) & 0xff : (entry.crc >>> 24) & 0xff;
  if (check !== expected) throw new ZipPasswordError('wrong_password');
  return out.subarray(12);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crcByte(crc, byte) {
  return (CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
}

/** WinZip AES: PBKDF2-HMAC-SHA1, AES-CTR with a little-endian counter, HMAC-SHA1 check. */
function decryptAes(data, password, strength) {
  const keyLength = { 1: 16, 2: 24, 3: 32 }[strength];
  if (!keyLength) throw new ZipFormatError(`Unsupported AES strength: ${strength}`);
  const saltLength = keyLength / 2;
  if (data.length < saltLength + 2 + 10) throw new ZipFormatError('Damaged AES entry');
  const salt = data.subarray(0, saltLength);
  const verifier = data.subarray(saltLength, saltLength + 2);
  const body = data.subarray(saltLength + 2, data.length - 10);
  const authentication = data.subarray(data.length - 10);
  const derived = pbkdf2Sync(passwordBytes(password), salt, 1000, keyLength * 2 + 2, 'sha1');
  const encryptionKey = derived.subarray(0, keyLength);
  const macKey = derived.subarray(keyLength, keyLength * 2);
  if (!timingSafeEqual(derived.subarray(keyLength * 2), verifier)) throw new ZipPasswordError('wrong_password');
  const mac = createHmac('sha1', macKey).update(body).digest().subarray(0, 10);
  if (!timingSafeEqual(mac, authentication)) throw new ZipPasswordError('wrong_password');

  const cipher = createCipheriv(`aes-${keyLength * 8}-ecb`, encryptionKey, null);
  cipher.setAutoPadding(false);
  const blocks = Math.ceil(body.length / 16);
  const counters = Buffer.alloc(blocks * 16);
  for (let i = 0; i < blocks; i += 1) {
    let value = i + 1;
    for (let j = 0; j < 8 && value > 0; j += 1) {
      counters[i * 16 + j] = value % 256;
      value = Math.floor(value / 256);
    }
  }
  const stream = Buffer.concat([cipher.update(counters), cipher.final()]);
  const out = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i += 1) out[i] = body[i] ^ stream[i];
  return out;
}
