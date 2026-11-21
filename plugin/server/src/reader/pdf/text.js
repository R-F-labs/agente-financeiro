import { Parser, PdfName, PdfOperator, PdfStream, PdfString, isName } from './objects.js';
import { TextFont } from './fonts.js';

const MAX_FORM_DEPTH = 8;
const MAX_OPERATIONS = 2_000_000;
const IDENTITY = [1, 0, 0, 1, 0, 0];

/**
 * @typedef {Object} PlacedChar
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} width Advance in page units.
 * @property {number} size Effective font size in page units.
 */

/**
 * Extracts the text of one page as lines, keeping the horizontal layout with spaces
 * so that columns of a statement (date, description, amount, balance) stay aligned.
 * @param {import('./document.js').PdfDocument} document
 * @param {Map<string, any>} page
 * @returns {string}
 */
export function extractPageText(document, page) {
  const chars = [];
  const fonts = new Map();
  const content = document.pageContent(page);
  const resources = document.resolve(page.get('Resources'));
  runContent(document, content, resources instanceof Map ? resources : new Map(), IDENTITY, chars, fonts, 0);
  return layoutLines(chars, rotation(document.resolve(page.get('Rotate'))));
}

function rotation(value) {
  const degrees = ((Number(value) || 0) % 360 + 360) % 360;
  return degrees;
}

function runContent(document, content, resources, baseMatrix, chars, fonts, depth) {
  const resolve = document.resolve;
  const parser = new Parser(content);
  const operands = [];
  const stack = [];
  let ctm = baseMatrix.slice();
  let text = newTextState();
  let tm = IDENTITY.slice();
  let tlm = IDENTITY.slice();
  let operations = 0;

  const fontFor = (name) => {
    const fontResources = resolve(resources.get('Font'));
    const ref = fontResources instanceof Map ? fontResources.get(name) : null;
    const dict = resolve(ref);
    if (!(dict instanceof Map)) return null;
    if (!fonts.has(dict)) {
      try {
        fonts.set(dict, new TextFont(document, dict));
      } catch {
        fonts.set(dict, null);
      }
    }
    return fonts.get(dict);
  };

  const show = (string) => {
    if (!(string instanceof PdfString) || !text.font) return;
    const horizontal = text.scale / 100;
    for (const glyph of text.font.decode(string.bytes)) {
      const trm = multiply([text.size * horizontal, 0, 0, text.size, 0, text.rise], multiply(tm, ctm));
      const advance = (glyph.width * text.size + text.charSpacing + (glyph.space ? text.wordSpacing : 0)) * horizontal;
      const size = Math.hypot(trm[2], trm[3]) || Math.abs(text.size);
      const widthOnPage = advance * Math.hypot(tm[0] * ctm[0] + tm[1] * ctm[2], tm[0] * ctm[1] + tm[1] * ctm[3]);
      if (glyph.text && text.render !== 7) chars.push({ text: glyph.text, x: trm[4], y: trm[5], width: widthOnPage, size });
      tm = multiply([1, 0, 0, 1, advance, 0], tm);
    }
  };

  const nextLine = (tx, ty) => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm.slice();
  };

  while (!parser.atEnd()) {
    operations += 1;
    if (operations > MAX_OPERATIONS) break;
    let token;
    try {
      token = parser.parse(false);
    } catch {
      break;
    }
    if (!(token instanceof PdfOperator)) {
      operands.push(token);
      continue;
    }
    const args = operands.splice(0, operands.length);
    const num = (index) => (typeof args[index] === 'number' ? args[index] : 0);
    switch (token.name) {
      case 'q':
        stack.push({ ctm: ctm.slice(), text: { ...text } });
        break;
      case 'Q': {
        const saved = stack.pop();
        if (saved) {
          ctm = saved.ctm;
          text = saved.text;
        }
        break;
      }
      case 'cm':
        if (args.length >= 6) ctm = multiply(args.slice(0, 6).map((value) => Number(value) || 0), ctm);
        break;
      case 'BT':
        tm = IDENTITY.slice();
        tlm = IDENTITY.slice();
        break;
      case 'Tf':
        if (args[0] instanceof PdfName) text.font = fontFor(args[0].value);
        text.size = num(1);
        break;
      case 'Tc':
        text.charSpacing = num(0);
        break;
      case 'Tw':
        text.wordSpacing = num(0);
        break;
      case 'Tz':
        text.scale = num(0);
        break;
      case 'TL':
        text.leading = num(0);
        break;
      case 'Ts':
        text.rise = num(0);
        break;
      case 'Tr':
        text.render = num(0);
        break;
      case 'Td':
        nextLine(num(0), num(1));
        break;
      case 'TD':
        text.leading = -num(1);
        nextLine(num(0), num(1));
        break;
      case 'Tm':
        if (args.length >= 6) {
          tlm = args.slice(0, 6).map((value) => Number(value) || 0);
          tm = tlm.slice();
        }
        break;
      case 'T*':
        nextLine(0, -text.leading);
        break;
      case 'Tj':
        show(args[0]);
        break;
      case "'":
        nextLine(0, -text.leading);
        show(args[0]);
        break;
      case '"':
        text.wordSpacing = num(0);
        text.charSpacing = num(1);
        nextLine(0, -text.leading);
        show(args[2]);
        break;
      case 'TJ':
        if (Array.isArray(args[0])) {
          for (const item of args[0]) {
            if (item instanceof PdfString) {
              show(item);
            } else if (typeof item === 'number') {
              const shift = (-item / 1000) * text.size * (text.scale / 100);
              tm = multiply([1, 0, 0, 1, shift, 0], tm);
            }
          }
        }
        break;
      case 'Do':
        if (depth < MAX_FORM_DEPTH && args[0] instanceof PdfName) runForm(document, resources, args[0].value, ctm, chars, fonts, depth);
        break;
      case 'BI':
        skipInlineImage(parser);
        break;
      default:
        break;
    }
  }
}

function runForm(document, resources, name, ctm, chars, fonts, depth) {
  const resolve = document.resolve;
  const xobjects = resolve(resources.get('XObject'));
  const form = resolve(xobjects instanceof Map ? xobjects.get(name) : null);
  if (!(form instanceof PdfStream) || !isName(resolve(form.dict.get('Subtype')), 'Form')) return;
  let data;
  try {
    data = document.streamData(form);
  } catch {
    return;
  }
  const matrix = resolve(form.dict.get('Matrix'));
  const formMatrix = Array.isArray(matrix) && matrix.length >= 6 ? matrix.slice(0, 6).map((value) => Number(resolve(value)) || 0) : IDENTITY;
  const formResources = resolve(form.dict.get('Resources'));
  runContent(document, data, formResources instanceof Map ? formResources : resources, multiply(formMatrix, ctm), chars, fonts, depth + 1);
}

/** Moves the parser past the binary data of an inline image (BI ... ID data EI). */
function skipInlineImage(parser) {
  const { bytes } = parser;
  let index = parser.pos;
  while (index < bytes.length - 1 && !(bytes[index] === 0x49 && bytes[index + 1] === 0x44 && isSpace(bytes[index + 2]) && isSpace(bytes[index - 1]))) index += 1;
  index += 3;
  while (index < bytes.length - 1) {
    if (bytes[index] === 0x45 && bytes[index + 1] === 0x49 && isSpace(bytes[index - 1]) && (index + 2 >= bytes.length || isSpace(bytes[index + 2]))) {
      parser.pos = index + 2;
      return;
    }
    index += 1;
  }
  parser.pos = bytes.length;
}

function isSpace(byte) {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09 || byte === 0x00 || byte === 0x0c;
}

function newTextState() {
  return { font: null, size: 0, charSpacing: 0, wordSpacing: 0, scale: 100, leading: 0, rise: 0, render: 0 };
}

/** Product of two PDF matrices [a b c d e f] (m1 then m2). */
function multiply(m1, m2) {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/**
 * Groups placed characters into lines (top to bottom) and joins each line left to right,
 * turning horizontal gaps into spaces.
 * @param {PlacedChar[]} chars
 * @param {number} pageRotation
 */
export function layoutLines(chars, pageRotation = 0) {
  const placed = chars.map((char) => rotatePoint(char, pageRotation)).filter((char) => Number.isFinite(char.x) && Number.isFinite(char.y));
  placed.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const char of placed) {
    const line = lines.at(-1);
    const tolerance = Math.max(1, Math.min(line?.size ?? char.size, char.size) * 0.45);
    if (line && Math.abs(line.y - char.y) <= tolerance) {
      line.chars.push(char);
    } else {
      lines.push({ y: char.y, size: char.size, chars: [char] });
    }
  }
  const left = placed.reduce((min, char) => Math.min(min, char.x), Number.POSITIVE_INFINITY);
  const output = [];
  for (const line of lines) {
    line.chars.sort((a, b) => a.x - b.x);
    const indent = Math.round((line.chars[0].x - left) / (Math.max(1, line.size) * 0.5));
    let text = indent > 0 ? ' '.repeat(Math.min(80, indent)) : '';
    let cursor = null;
    for (const char of line.chars) {
      if (cursor !== null) {
        const gap = char.x - cursor.end;
        const size = Math.max(1, char.size);
        if (char.text === cursor.text && Math.abs(char.x - cursor.x) < size * 0.15) continue;
        if (gap > size * 0.18 && !text.endsWith(' ') && char.text !== ' ') {
          text += ' '.repeat(Math.min(60, Math.max(1, Math.round(gap / (size * 0.5)))));
        }
      }
      text += char.text;
      cursor = { x: char.x, end: char.x + Math.max(char.width, 0), text: char.text };
    }
    output.push(text.replace(/[\ufb00-\ufb06]/g, (ligature) => ligature.normalize('NFKC')).replace(/\s+$/, ''));
  }
  return output.join('\n');
}

function rotatePoint(char, degrees) {
  switch (degrees) {
    case 90:
      return { ...char, x: -char.y, y: char.x };
    case 180:
      return { ...char, x: -char.x, y: -char.y };
    case 270:
      return { ...char, x: char.y, y: -char.x };
    default:
      return char;
  }
}
