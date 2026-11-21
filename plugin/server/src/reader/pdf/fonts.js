import { Parser, PdfName, PdfOperator, PdfStream, PdfString, isName } from './objects.js';
import { baseEncoding, glyphToUnicode, standardFontWidth } from './encodings.js';

/**
 * @typedef {Object} Glyph
 * @property {string} text Unicode text ('' when unknown).
 * @property {number} width Advance in text space units per unit of font size.
 * @property {boolean} space True for the single-byte code 32 (receives word spacing).
 */

/**
 * Font as needed for text extraction: splits strings into character codes and maps
 * each to Unicode and to an advance width.
 */
export class TextFont {
  /**
   * @param {import('./document.js').PdfDocument} document
   * @param {Map<string, any>} dict
   */
  constructor(document, dict) {
    const resolve = document.resolve;
    this.subtype = resolve(dict.get('Subtype'))?.value ?? 'Type1';
    this.baseFont = resolve(dict.get('BaseFont'))?.value ?? '';
    const toUnicode = resolve(dict.get('ToUnicode'));
    this.cmap = toUnicode instanceof PdfStream ? parseCMap(safeData(document, toUnicode)) : null;

    if (this.subtype === 'Type0') {
      this.composite = true;
      const encoding = resolve(dict.get('Encoding'));
      const encodingMap = encoding instanceof PdfStream ? parseCMap(safeData(document, encoding)) : null;
      this.codeRanges = encodingMap?.codespace.length ? encodingMap.codespace : this.cmap?.codespace.length ? this.cmap.codespace : null;
      const descendants = resolve(dict.get('DescendantFonts'));
      const descendant = resolve(Array.isArray(descendants) ? descendants[0] : null);
      this.defaultWidth = 1000;
      /** @type {Map<number, number>} */
      this.cidWidths = new Map();
      if (descendant instanceof Map) {
        this.defaultWidth = Number(resolve(descendant.get('DW')) ?? 1000);
        readCidWidths(resolve(descendant.get('W')), resolve, this.cidWidths);
      }
      this.scale = 0.001;
      return;
    }

    this.composite = false;
    this.scale = 0.001;
    if (this.subtype === 'Type3') {
      const matrix = resolve(dict.get('FontMatrix'));
      this.scale = Array.isArray(matrix) && typeof matrix[0] === 'number' ? matrix[0] : 0.001;
    }
    const firstChar = Number(resolve(dict.get('FirstChar')) ?? 0);
    const widths = resolve(dict.get('Widths'));
    /** @type {(number | undefined)[]} */
    this.widths = new Array(256).fill(undefined);
    if (Array.isArray(widths)) {
      widths.forEach((width, index) => {
        const code = firstChar + index;
        if (code >= 0 && code < 256) this.widths[code] = Number(resolve(width)) || 0;
      });
    }
    const descriptor = resolve(dict.get('FontDescriptor'));
    this.missingWidth = descriptor instanceof Map ? Number(resolve(descriptor.get('MissingWidth')) ?? 0) : 0;
    this.hasWidths = Array.isArray(widths);

    const encoding = resolve(dict.get('Encoding'));
    let baseName;
    let differences = null;
    if (encoding instanceof PdfName) baseName = encoding.value;
    if (encoding instanceof Map) {
      baseName = resolve(encoding.get('BaseEncoding'))?.value;
      differences = resolve(encoding.get('Differences'));
    }
    const flags = descriptor instanceof Map ? Number(resolve(descriptor.get('Flags')) ?? 0) : 0;
    const symbolic = (flags & 4) !== 0 && !baseName;
    this.table = symbolic ? latin1Table() : baseEncoding(baseName).slice();
    if (Array.isArray(differences)) {
      let code = 0;
      for (const item of differences) {
        const value = resolve(item);
        if (typeof value === 'number') {
          code = value;
        } else if (value instanceof PdfName) {
          if (code >= 0 && code < 256) this.table[code] = glyphToUnicode(value.value) ?? (this.subtype === 'Type3' ? '' : this.table[code]);
          code += 1;
        }
      }
    }
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {Glyph[]}
   */
  decode(bytes) {
    const glyphs = [];
    if (this.composite) {
      let i = 0;
      while (i < bytes.length) {
        const length = this.codeLength(bytes, i);
        let code = 0;
        for (let j = 0; j < length; j += 1) code = code * 256 + (bytes[i + j] ?? 0);
        const text = this.cmap?.map.get(codeKey(code, length)) ?? '';
        const width = (this.cidWidths.get(code) ?? this.defaultWidth) * this.scale;
        glyphs.push({ text, width, space: length === 1 && code === 32 });
        i += length;
      }
      return glyphs;
    }
    for (const code of bytes) {
      const mapped = this.cmap?.map.get(codeKey(code, 1));
      const text = mapped ?? this.table[code] ?? '';
      let width = this.widths[code];
      if (width === undefined) width = this.hasWidths ? this.missingWidth : standardFontWidth(this.baseFont, text);
      glyphs.push({ text, width: width * this.scale, space: code === 32 });
    }
    return glyphs;
  }

  codeLength(bytes, index) {
    if (!this.codeRanges) return 2;
    for (let length = 1; length <= 4; length += 1) {
      let code = 0;
      for (let j = 0; j < length; j += 1) code = code * 256 + (bytes[index + j] ?? 0);
      if (this.codeRanges.some((range) => range.length === length && code >= range.low && code <= range.high)) return length;
    }
    return 2;
  }
}

function safeData(document, stream) {
  try {
    return document.streamData(stream);
  } catch {
    return new Uint8Array(0);
  }
}

function latin1Table() {
  return Array.from({ length: 256 }, (_, code) => (code >= 0x20 ? String.fromCharCode(code) : undefined));
}

function codeKey(code, length) {
  return length * 0x100000000 + code;
}

function readCidWidths(array, resolve, target) {
  if (!Array.isArray(array)) return;
  let i = 0;
  while (i < array.length) {
    const first = Number(resolve(array[i]));
    const next = resolve(array[i + 1]);
    if (Array.isArray(next)) {
      next.forEach((width, offset) => target.set(first + offset, Number(resolve(width)) || 0));
      i += 2;
    } else {
      const last = Number(next);
      const width = Number(resolve(array[i + 2])) || 0;
      for (let cid = first; cid <= last && cid - first < 65536; cid += 1) target.set(cid, width);
      i += 3;
    }
  }
}

/**
 * Parses the parts of a CMap that matter for text: code space ranges, bfchar and bfrange.
 * @param {Uint8Array} data
 * @returns {{ codespace: { low: number, high: number, length: number }[], map: Map<number, string> }}
 */
export function parseCMap(data) {
  const codespace = [];
  const map = new Map();
  const parser = new Parser(data);
  const pending = [];
  let mode = null;
  let guard = 0;
  while (!parser.atEnd() && guard < 2_000_000) {
    guard += 1;
    let token;
    try {
      token = parser.parse(false);
    } catch {
      break;
    }
    if (token instanceof PdfOperator) {
      const name = token.name;
      if (name === 'begincodespacerange' || name === 'beginbfchar' || name === 'beginbfrange') {
        mode = name;
        pending.length = 0;
      } else if (name === 'endcodespacerange') {
        for (let i = 0; i + 1 < pending.length; i += 2) {
          const low = pending[i];
          const high = pending[i + 1];
          if (low instanceof PdfString && high instanceof PdfString) {
            codespace.push({ low: toCode(low.bytes), high: toCode(high.bytes), length: low.bytes.length });
          }
        }
        mode = null;
      } else if (name === 'endbfchar') {
        for (let i = 0; i + 1 < pending.length; i += 2) {
          const source = pending[i];
          const target = pending[i + 1];
          if (!(source instanceof PdfString)) continue;
          const text = target instanceof PdfString ? utf16(target.bytes) : isName(target) ? glyphToUnicode(target.value) ?? '' : '';
          map.set(codeKey(toCode(source.bytes), source.bytes.length), text);
        }
        mode = null;
      } else if (name === 'endbfrange') {
        for (let i = 0; i + 2 < pending.length; i += 3) {
          const low = pending[i];
          const high = pending[i + 1];
          const target = pending[i + 2];
          if (!(low instanceof PdfString) || !(high instanceof PdfString)) continue;
          const length = low.bytes.length;
          const start = toCode(low.bytes);
          const end = Math.min(toCode(high.bytes), start + 65535);
          for (let code = start; code <= end; code += 1) {
            let text = '';
            if (Array.isArray(target)) {
              const item = target[code - start];
              text = item instanceof PdfString ? utf16(item.bytes) : '';
            } else if (target instanceof PdfString) {
              text = incrementUtf16(target.bytes, code - start);
            }
            map.set(codeKey(code, length), text);
          }
        }
        mode = null;
      }
      continue;
    }
    if (mode) pending.push(token);
  }
  return { codespace, map };
}

function toCode(bytes) {
  let code = 0;
  for (const byte of bytes) code = code * 256 + byte;
  return code;
}

function utf16(bytes) {
  let text = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode(bytes[i] * 256 + bytes[i + 1]);
  if (bytes.length % 2 === 1) text += String.fromCharCode(bytes[bytes.length - 1]);
  return text;
}

function incrementUtf16(bytes, offset) {
  const copy = Uint8Array.from(bytes);
  let carry = offset;
  for (let i = copy.length - 1; i >= 0 && carry > 0; i -= 1) {
    const sum = copy[i] + carry;
    copy[i] = sum & 0xff;
    carry = sum >> 8;
  }
  return utf16(copy);
}
