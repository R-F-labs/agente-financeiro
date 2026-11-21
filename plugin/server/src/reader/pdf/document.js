import { Parser, PdfRef, PdfStream, PdfString, isName } from './objects.js';
import { decodeStream } from './filters.js';
import { PdfPasswordError, StandardSecurityHandler } from './security.js';

/** Raised when the bytes are not a PDF file. */
export class NotPdfError extends Error {}

const MAX_PAGES = 500;

/**
 * @typedef {Object} ObjectEntry
 * @property {number} num
 * @property {number} gen
 * @property {any} value
 * @property {number} offset Position in the file (object streams: position of the container).
 * @property {boolean} embedded True for objects read from an object stream.
 */

/**
 * In-memory view of a PDF. Objects are found by scanning the file body instead of
 * trusting the cross-reference table, which makes the reader tolerant of the damaged
 * or incrementally updated files that bank systems often produce.
 */
export class PdfDocument {
  /**
   * @param {Uint8Array} bytes
   * @param {{ password?: string }} [options]
   */
  static open(bytes, options = {}) {
    const document = new PdfDocument(bytes);
    document.load(options.password ?? '');
    return document;
  }

  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('latin1');
    /** @type {Map<number, ObjectEntry>} */
    this.objects = new Map();
    /** @type {Map<string, any>} */
    this.trailer = new Map();
    /** @type {StandardSecurityHandler | null} */
    this.security = null;
    this.encrypted = false;
    this.passwordProtected = false;
    /** @type {WeakMap<PdfStream, Uint8Array>} */
    this.decoded = new WeakMap();
    this.resolve = this.resolve.bind(this);
  }

  /** @param {string} password */
  load(password) {
    const header = this.text.slice(0, 1024).indexOf('%PDF-');
    if (header < 0) throw new NotPdfError('Not a PDF file');
    this.scanObjects();
    this.readTrailers();
    this.setUpEncryption(password);
    this.unpackObjectStreams();
  }

  scanObjects() {
    const pattern = /(\d+)\s+(\d+)\s+obj\b/g;
    let skipUntil = 0;
    for (let match = pattern.exec(this.text); match; match = pattern.exec(this.text)) {
      if (match.index < skipUntil) continue;
      if (match.index > 0 && /[0-9]/.test(this.text[match.index - 1])) continue;
      const num = Number(match[1]);
      const gen = Number(match[2]);
      const parser = new Parser(this.bytes, match.index + match[0].length);
      let value;
      try {
        value = parser.parse();
      } catch {
        continue;
      }
      parser.skipSpace();
      let end = parser.pos;
      if (value instanceof Map && this.text.startsWith('stream', parser.pos)) {
        const { stream, endsAt } = this.readStreamBody(value, parser.pos + 6);
        value = stream;
        end = endsAt;
      }
      value = markOwner(value, num, gen);
      this.objects.set(num, { num, gen, value, offset: match.index, embedded: false });
      skipUntil = end;
      pattern.lastIndex = Math.max(pattern.lastIndex, end);
    }
  }

  readStreamBody(dict, afterKeyword) {
    let start = afterKeyword;
    if (this.bytes[start] === 0x0d) start += 1;
    if (this.bytes[start] === 0x0a) start += 1;
    const declared = dict.get('Length');
    if (typeof declared === 'number' && declared >= 0 && start + declared <= this.bytes.length) {
      const after = this.text.slice(start + declared, start + declared + 32);
      if (/^\s*endstream/.test(after)) {
        const endsAt = start + declared + after.indexOf('endstream') + 9;
        return { stream: new PdfStream(dict, this.bytes.subarray(start, start + declared)), endsAt };
      }
    }
    let finish = this.text.indexOf('endstream', start);
    if (finish < 0) finish = this.bytes.length;
    let dataEnd = finish;
    if (this.bytes[dataEnd - 1] === 0x0a) dataEnd -= 1;
    if (this.bytes[dataEnd - 1] === 0x0d) dataEnd -= 1;
    return { stream: new PdfStream(dict, this.bytes.subarray(start, Math.max(start, dataEnd))), endsAt: finish + 9 };
  }

  readTrailers() {
    const candidates = [];
    const pattern = /trailer\s*<</g;
    for (let match = pattern.exec(this.text); match; match = pattern.exec(this.text)) {
      try {
        const dict = new Parser(this.bytes, match.index + 7).parse();
        if (dict instanceof Map) candidates.push({ offset: match.index, dict });
      } catch {
        // A damaged trailer is ignored; others may still describe the file.
      }
    }
    for (const entry of this.objects.values()) {
      if (entry.value instanceof PdfStream && isName(entry.value.dict.get('Type'), 'XRef')) {
        candidates.push({ offset: entry.offset, dict: entry.value.dict });
      }
    }
    candidates.sort((a, b) => a.offset - b.offset);
    for (const { dict } of candidates) {
      for (const [key, value] of dict) {
        if (['Root', 'Info', 'Encrypt', 'ID', 'Size'].includes(key)) this.trailer.set(key, value);
      }
    }
  }

  /** @param {string} password */
  setUpEncryption(password) {
    const encryptValue = this.trailer.get('Encrypt');
    if (!encryptValue) return;
    const encrypt = this.resolve(encryptValue);
    if (!(encrypt instanceof Map)) return;
    this.encrypted = true;
    const ids = this.resolve(this.trailer.get('ID'));
    const firstId = Array.isArray(ids) && ids[0] instanceof PdfString ? ids[0].bytes : new Uint8Array(0);
    try {
      // Many PDFs are encrypted only to restrict printing or copying: they open without a password.
      this.security = new StandardSecurityHandler(encrypt, firstId, '', this.resolve);
      this.passwordProtected = false;
    } catch (error) {
      if (!(error instanceof PdfPasswordError) || password === '') throw error;
      this.security = new StandardSecurityHandler(encrypt, firstId, password, this.resolve);
      this.passwordProtected = true;
    }
    const encryptNum = encryptValue instanceof PdfRef ? encryptValue.num : -1;
    for (const entry of this.objects.values()) {
      if (entry.num === encryptNum) continue;
      if (entry.value instanceof PdfStream) {
        if (isName(entry.value.dict.get('Type'), 'XRef')) continue;
        decryptStrings(entry.value.dict, this.security, entry.num, entry.gen);
      } else {
        entry.value = decryptStrings(entry.value, this.security, entry.num, entry.gen);
      }
    }
  }

  unpackObjectStreams() {
    const containers = [...this.objects.values()].filter(
      (entry) => entry.value instanceof PdfStream && isName(entry.value.dict.get('Type'), 'ObjStm'),
    );
    for (const container of containers) {
      let data;
      try {
        data = this.streamData(container.value);
      } catch {
        continue;
      }
      const count = Number(this.resolve(container.value.dict.get('N')) ?? 0);
      const first = Number(this.resolve(container.value.dict.get('First')) ?? 0);
      const header = new Parser(data);
      const pairs = [];
      for (let i = 0; i < count; i += 1) {
        const num = header.parse(false);
        const offset = header.parse(false);
        if (typeof num !== 'number' || typeof offset !== 'number') break;
        pairs.push([num, offset]);
      }
      for (const [num, offset] of pairs) {
        const existing = this.objects.get(num);
        if (existing && !existing.embedded && existing.offset > container.offset) continue;
        try {
          const value = new Parser(data, first + offset).parse();
          this.objects.set(num, { num, gen: 0, value, offset: container.offset, embedded: true });
        } catch {
          // Skip a damaged entry; the rest of the container is still usable.
        }
      }
    }
  }

  /**
   * Resolves indirect references (one level per call, repeated until a direct value).
   * @param {any} value
   */
  resolve(value) {
    let current = value;
    for (let depth = 0; current instanceof PdfRef && depth < 32; depth += 1) {
      current = this.objects.get(current.num)?.value ?? null;
    }
    return current instanceof PdfRef ? null : current;
  }

  /**
   * Decrypted and decoded bytes of a stream.
   * @param {PdfStream} stream
   * @returns {Uint8Array}
   */
  streamData(stream) {
    const cached = this.decoded.get(stream);
    if (cached) return cached;
    const data = decodeStream(this.decryptedStreamBytes(stream), stream.dict, this.resolve);
    this.decoded.set(stream, data);
    return data;
  }

  /**
   * Stream bytes after decryption but before the /Filter chain.
   * @param {PdfStream} stream
   */
  decryptedStreamBytes(stream) {
    if (!this.security || stream.ownerNum === undefined) return stream.raw;
    if (isName(stream.dict.get('Type'), 'XRef')) return stream.raw;
    if (isName(stream.dict.get('Type'), 'Metadata') && !this.security.encryptMetadata) return stream.raw;
    const filters = this.resolve(stream.dict.get('Filter'));
    const list = Array.isArray(filters) ? filters : [filters];
    if (list.some((filter) => isName(filter, 'Crypt'))) return stream.raw;
    return this.security.decryptStream(stream.raw, stream.ownerNum, stream.ownerGen);
  }

  /** Document catalog. */
  catalog() {
    const root = this.resolve(this.trailer.get('Root'));
    return root instanceof Map ? root : null;
  }

  /**
   * Leaf page dictionaries in reading order, with inherited attributes applied.
   * @returns {Map<string, any>[]}
   */
  pages() {
    const result = [];
    const visited = new Set();
    const walk = (node, inherited) => {
      if (result.length >= MAX_PAGES) return;
      const dict = this.resolve(node);
      if (!(dict instanceof Map) || visited.has(dict)) return;
      visited.add(dict);
      const attributes = { ...inherited };
      for (const key of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
        if (dict.has(key)) attributes[key] = dict.get(key);
      }
      const kids = this.resolve(dict.get('Kids'));
      if (Array.isArray(kids) && !isName(dict.get('Type'), 'Page')) {
        for (const kid of kids) walk(kid, attributes);
        return;
      }
      const page = new Map(dict);
      for (const [key, value] of Object.entries(attributes)) if (!page.has(key)) page.set(key, value);
      result.push(page);
    };
    const catalog = this.catalog();
    if (catalog) walk(catalog.get('Pages'), {});
    if (result.length === 0) {
      const loose = [...this.objects.values()]
        .filter((entry) => entry.value instanceof Map && isName(entry.value.get('Type'), 'Page'))
        .sort((a, b) => a.num - b.num);
      for (const entry of loose.slice(0, MAX_PAGES)) result.push(entry.value);
    }
    return result;
  }

  /**
   * Concatenated, decoded content of a page (or of a form XObject).
   * @param {Map<string, any>} page
   */
  pageContent(page) {
    const contents = this.resolve(page.get('Contents'));
    const streams = Array.isArray(contents) ? contents.map(this.resolve) : [contents];
    const parts = [];
    for (const stream of streams) {
      if (!(stream instanceof PdfStream)) continue;
      try {
        parts.push(this.streamData(stream), Uint8Array.of(0x0a));
      } catch {
        // An undecodable content stream is skipped; the remaining text is still useful.
      }
    }
    return Buffer.concat(parts);
  }
}

function markOwner(value, num, gen) {
  if (value instanceof PdfStream) {
    value.ownerNum = num;
    value.ownerGen = gen;
  }
  return value;
}

/**
 * Decrypts every string inside a value (strings of regular objects are encrypted
 * with the key of the object that contains them).
 */
function decryptStrings(value, security, num, gen) {
  if (value instanceof PdfString) return new PdfString(security.decryptString(value.bytes, num, gen), value.hex);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) value[i] = decryptStrings(value[i], security, num, gen);
    return value;
  }
  if (value instanceof Map) {
    for (const [key, child] of value) value.set(key, decryptStrings(child, security, num, gen));
    return value;
  }
  return value;
}

