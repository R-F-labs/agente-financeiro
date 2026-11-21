import { constants, inflateSync } from 'node:zlib';
import { PdfName, hexValue, isWhitespace } from './objects.js';

/** Filters that only matter for images: their data is returned undecoded. */
const IMAGE_FILTERS = new Set(['DCTDecode', 'JPXDecode', 'CCITTFaxDecode', 'JBIG2Decode']);
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

/**
 * Applies the stream's /Filter chain (section 7.4).
 * @param {Uint8Array} data Decrypted stream bytes.
 * @param {Map<string, any>} dict Stream dictionary.
 * @param {(value: any) => any} resolve Resolves indirect references.
 * @returns {Uint8Array}
 */
export function decodeStream(data, dict, resolve) {
  const filters = toList(resolve(dict.get('Filter')));
  const params = toList(resolve(dict.get('DecodeParms') ?? dict.get('DP')));
  let output = data;
  filters.forEach((filter, index) => {
    const name = filter instanceof PdfName ? filter.value : String(filter);
    const parameters = resolve(params[index]) ?? null;
    output = applyFilter(name, output, parameters instanceof Map ? parameters : null, resolve);
  });
  return output;
}

function applyFilter(name, data, params, resolve) {
  switch (name) {
    case 'FlateDecode':
    case 'Fl':
      return predict(inflate(data), params, resolve);
    case 'LZWDecode':
    case 'LZW':
      return predict(lzwDecode(data, Number(resolve(params?.get('EarlyChange')) ?? 1)), params, resolve);
    case 'ASCIIHexDecode':
    case 'AHx':
      return asciiHexDecode(data);
    case 'ASCII85Decode':
    case 'A85':
      return ascii85Decode(data);
    case 'RunLengthDecode':
    case 'RL':
      return runLengthDecode(data);
    case 'Crypt':
      return data;
    default:
      if (IMAGE_FILTERS.has(name)) return data;
      throw new Error(`Unsupported PDF filter: ${name}`);
  }
}

function toList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Inflates zlib data, keeping what was decoded when the stream is truncated. */
function inflate(data) {
  try {
    return inflateSync(data, { maxOutputLength: MAX_DECODED_BYTES });
  } catch {
    try {
      return inflateSync(data, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: MAX_DECODED_BYTES });
    } catch {
      return new Uint8Array(0);
    }
  }
}

/** PNG and TIFF predictors (section 7.4.4.4). */
function predict(data, params, resolve) {
  const predictor = Number(resolve(params?.get('Predictor')) ?? 1);
  if (predictor <= 1) return data;
  const colors = Number(resolve(params.get('Colors')) ?? 1);
  const bits = Number(resolve(params.get('BitsPerComponent')) ?? 8);
  const columns = Number(resolve(params.get('Columns')) ?? 1);
  const bytesPerPixel = Math.max(1, Math.ceil((colors * bits) / 8));
  const rowLength = Math.ceil((colors * bits * columns) / 8);
  if (predictor === 2) {
    const out = Uint8Array.from(data);
    for (let row = 0; row + rowLength <= out.length; row += rowLength) {
      for (let i = bytesPerPixel; i < rowLength; i += 1) out[row + i] = (out[row + i] + out[row + i - bytesPerPixel]) & 0xff;
    }
    return out;
  }
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = new Uint8Array(rows * rowLength);
  let previous = new Uint8Array(rowLength);
  for (let row = 0; row < rows; row += 1) {
    const offset = row * (rowLength + 1);
    const type = data[offset];
    const current = out.subarray(row * rowLength, (row + 1) * rowLength);
    for (let i = 0; i < rowLength; i += 1) {
      const raw = data[offset + 1 + i];
      const left = i >= bytesPerPixel ? current[i - bytesPerPixel] : 0;
      const up = previous[i];
      const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      let value;
      switch (type) {
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + ((left + up) >> 1); break;
        case 4: value = raw + paeth(left, up, upLeft); break;
        default: value = raw;
      }
      current[i] = value & 0xff;
    }
    previous = current;
  }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function asciiHexDecode(data) {
  const out = [];
  let high = -1;
  for (const byte of data) {
    if (byte === 0x3e) break;
    const value = hexValue(byte);
    if (value < 0) continue;
    if (high < 0) {
      high = value;
    } else {
      out.push(high * 16 + value);
      high = -1;
    }
  }
  if (high >= 0) out.push(high * 16);
  return Uint8Array.from(out);
}

function ascii85Decode(data) {
  const out = [];
  const group = [];
  let i = 0;
  if (data[0] === 0x3c && data[1] === 0x7e) i = 2;
  for (; i < data.length; i += 1) {
    const byte = data[i];
    if (byte === 0x7e) break;
    if (isWhitespace(byte)) continue;
    if (byte === 0x7a && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (byte < 0x21 || byte > 0x75) continue;
    group.push(byte - 0x21);
    if (group.length === 5) {
      pushGroup(out, group, 4);
      group.length = 0;
    }
  }
  if (group.length > 1) {
    const missing = 5 - group.length;
    while (group.length < 5) group.push(84);
    pushGroup(out, group, 4 - missing);
  }
  return Uint8Array.from(out);
}

function pushGroup(out, group, count) {
  let value = 0;
  for (const digit of group) value = value * 85 + digit;
  const bytes = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
  out.push(...bytes.slice(0, count));
}

function runLengthDecode(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const length = data[i++];
    if (length === 128) break;
    if (length < 128) {
      for (let j = 0; j <= length && i < data.length; j += 1) out.push(data[i++]);
    } else {
      const byte = data[i++];
      for (let j = 0; j < 257 - length; j += 1) out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

function lzwDecode(data, earlyChange) {
  const out = [];
  let dictionary = [];
  const reset = () => {
    dictionary = [];
    for (let i = 0; i < 256; i += 1) dictionary.push([i]);
    dictionary.push(null, null);
  };
  reset();
  let codeLength = 9;
  let bitBuffer = 0;
  let bitCount = 0;
  let previous = null;
  for (const byte of data) {
    bitBuffer = (bitBuffer << 8) | byte;
    bitCount += 8;
    while (bitCount >= codeLength) {
      const code = (bitBuffer >> (bitCount - codeLength)) & ((1 << codeLength) - 1);
      bitCount -= codeLength;
      bitBuffer &= (1 << bitCount) - 1;
      if (code === 256) {
        reset();
        codeLength = 9;
        previous = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(out);
      let entry;
      if (code < dictionary.length && dictionary[code]) entry = dictionary[code];
      else if (previous) entry = [...previous, previous[0]];
      else continue;
      out.push(...entry);
      if (previous) dictionary.push([...previous, entry[0]]);
      previous = entry;
      const limit = (1 << codeLength) - earlyChange;
      if (dictionary.length >= limit && codeLength < 12) codeLength += 1;
    }
  }
  return Uint8Array.from(out);
}
