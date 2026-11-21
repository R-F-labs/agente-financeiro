/**
 * PDF object model and a tolerant parser for the PDF syntax (ISO 32000-1, section 7.3).
 * Values map to: numbers, booleans, null, PdfName, PdfString, PdfRef, Array (arrays),
 * Map (dictionaries), PdfStream and PdfOperator (only inside content streams).
 */

export class PdfName {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }
}

export class PdfString {
  /**
   * @param {Uint8Array} bytes
   * @param {boolean} [hex]
   */
  constructor(bytes, hex = false) {
    this.bytes = bytes;
    this.hex = hex;
  }
}

export class PdfRef {
  /**
   * @param {number} num
   * @param {number} gen
   */
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
}

export class PdfStream {
  /**
   * @param {Map<string, any>} dict
   * @param {Uint8Array} raw Stream bytes exactly as stored (possibly encrypted and encoded).
   */
  constructor(dict, raw) {
    this.dict = dict;
    this.raw = raw;
  }
}

export class PdfOperator {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
  }
}

/** @param {unknown} value @param {string} [name] */
export function isName(value, name) {
  return value instanceof PdfName && (name === undefined || value.value === name);
}

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

/** @param {number} byte */
export function isWhitespace(byte) {
  return WHITESPACE.has(byte);
}

/** @param {number} byte */
function isRegular(byte) {
  return !WHITESPACE.has(byte) && !DELIMITERS.has(byte);
}

const END_OF_DATA = Symbol('end');

/**
 * Reads PDF values from a byte buffer. Used for the file body, object streams
 * and page content streams.
 */
export class Parser {
  /**
   * @param {Uint8Array} bytes
   * @param {number} [position]
   */
  constructor(bytes, position = 0) {
    this.bytes = bytes;
    this.pos = position;
  }

  skipSpace() {
    const { bytes } = this;
    while (this.pos < bytes.length) {
      const byte = bytes[this.pos];
      if (WHITESPACE.has(byte)) {
        this.pos += 1;
      } else if (byte === 0x25) {
        while (this.pos < bytes.length && bytes[this.pos] !== 0x0a && bytes[this.pos] !== 0x0d) this.pos += 1;
      } else {
        break;
      }
    }
  }

  atEnd() {
    this.skipSpace();
    return this.pos >= this.bytes.length;
  }

  /** Reads a bare keyword or number token (regular characters only). */
  readRegular() {
    const start = this.pos;
    while (this.pos < this.bytes.length && isRegular(this.bytes[this.pos])) this.pos += 1;
    return latin1(this.bytes.subarray(start, this.pos));
  }

  /**
   * Parses one value. Keywords that are not values become PdfOperator.
   * `R` references are folded when `allowRefs` is true.
   * @param {boolean} [allowRefs]
   * @returns {any}
   */
  parse(allowRefs = true) {
    const value = this.parseOne();
    if (value === END_OF_DATA) throw new Error('Unexpected end of PDF data');
    if (allowRefs && typeof value === 'number' && Number.isInteger(value)) return this.foldReference(value);
    return value;
  }

  /** @returns {any} */
  parseOne() {
    this.skipSpace();
    const { bytes } = this;
    if (this.pos >= bytes.length) return END_OF_DATA;
    const byte = bytes[this.pos];
    if (byte === 0x2f) {
      this.pos += 1;
      return new PdfName(decodeName(this.readRegular()));
    }
    if (byte === 0x28) return this.parseLiteralString();
    if (byte === 0x3c) {
      if (bytes[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return this.parseDictionary();
      }
      return this.parseHexString();
    }
    if (byte === 0x5b) {
      this.pos += 1;
      const items = [];
      for (;;) {
        this.skipSpace();
        if (this.pos >= bytes.length) break;
        if (bytes[this.pos] === 0x5d) {
          this.pos += 1;
          break;
        }
        const item = this.parseOne();
        if (item === END_OF_DATA) break;
        items.push(typeof item === 'number' && Number.isInteger(item) ? this.foldReference(item) : item);
      }
      return items;
    }
    if (byte === 0x3e || byte === 0x5d || byte === 0x29 || byte === 0x7b || byte === 0x7d) {
      // Stray delimiter: skip it so a damaged file does not stop the reader.
      this.pos += 1;
      return new PdfOperator(String.fromCharCode(byte));
    }
    const token = this.readRegular();
    if (token === '') {
      this.pos += 1;
      return this.parseOne();
    }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) return Number(token);
    if (/^[+-]*[\d.]+$/.test(token) && /\d/.test(token)) {
      // Malformed numbers such as "--5" or "1.2.3" are read the way viewers do.
      const sign = token.startsWith('-') ? -1 : 1;
      return sign * (Number.parseFloat(token.replace(/^[+-]+/, '')) || 0);
    }
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    return new PdfOperator(token);
  }

  /**
   * After an integer, checks whether "gen R" follows and returns a reference.
   * @param {number} num
   */
  foldReference(num) {
    const saved = this.pos;
    this.skipSpace();
    const gen = this.readRegular();
    if (/^\d+$/.test(gen)) {
      this.skipSpace();
      if (this.bytes[this.pos] === 0x52 && (this.pos + 1 >= this.bytes.length || !isRegular(this.bytes[this.pos + 1]))) {
        this.pos += 1;
        return new PdfRef(num, Number(gen));
      }
    }
    this.pos = saved;
    return num;
  }

  parseDictionary() {
    const dict = new Map();
    const { bytes } = this;
    for (;;) {
      this.skipSpace();
      if (this.pos >= bytes.length) break;
      if (bytes[this.pos] === 0x3e && bytes[this.pos + 1] === 0x3e) {
        this.pos += 2;
        break;
      }
      const key = this.parseOne();
      if (key === END_OF_DATA) break;
      if (!(key instanceof PdfName)) continue;
      this.skipSpace();
      if (bytes[this.pos] === 0x3e && bytes[this.pos + 1] === 0x3e) {
        dict.set(key.value, null);
        continue;
      }
      const value = this.parseOne();
      if (value === END_OF_DATA) break;
      dict.set(key.value, typeof value === 'number' && Number.isInteger(value) ? this.foldReference(value) : value);
    }
    return dict;
  }

  parseLiteralString() {
    const { bytes } = this;
    this.pos += 1;
    const out = [];
    let depth = 1;
    while (this.pos < bytes.length) {
      const byte = bytes[this.pos++];
      if (byte === 0x5c) {
        const next = bytes[this.pos++];
        switch (next) {
          case 0x6e: out.push(0x0a); break;
          case 0x72: out.push(0x0d); break;
          case 0x74: out.push(0x09); break;
          case 0x62: out.push(0x08); break;
          case 0x66: out.push(0x0c); break;
          case 0x0d:
            if (bytes[this.pos] === 0x0a) this.pos += 1;
            break;
          case 0x0a:
            break;
          default:
            if (next >= 0x30 && next <= 0x37) {
              let code = next - 0x30;
              for (let i = 0; i < 2 && bytes[this.pos] >= 0x30 && bytes[this.pos] <= 0x37; i += 1) {
                code = code * 8 + (bytes[this.pos++] - 0x30);
              }
              out.push(code & 0xff);
            } else if (next !== undefined) {
              out.push(next);
            }
        }
      } else if (byte === 0x28) {
        depth += 1;
        out.push(byte);
      } else if (byte === 0x29) {
        depth -= 1;
        if (depth === 0) break;
        out.push(byte);
      } else {
        out.push(byte);
      }
    }
    return new PdfString(Uint8Array.from(out));
  }

  parseHexString() {
    const { bytes } = this;
    this.pos += 1;
    const digits = [];
    while (this.pos < bytes.length && bytes[this.pos] !== 0x3e) {
      const value = hexValue(bytes[this.pos++]);
      if (value >= 0) digits.push(value);
    }
    this.pos += 1;
    if (digits.length % 2 === 1) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = digits[i * 2] * 16 + digits[i * 2 + 1];
    return new PdfString(out, true);
  }
}

/** @param {number} byte */
export function hexValue(byte) {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return -1;
}

/** @param {string} raw */
function decodeName(raw) {
  return raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))) : raw;
}

/** @param {Uint8Array} bytes */
export function latin1(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}
