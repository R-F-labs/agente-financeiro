/**
 * Character encodings and glyph names needed to turn PDF text bytes into Unicode
 * when a font has no /ToUnicode map (section 9.6.6 and Annex D).
 */

const ASCII_NAMES = [
  'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle',
  'parenleft', 'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore', 'grave',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'braceleft', 'bar', 'braceright', 'asciitilde',
];

/** Windows-1252 characters in 0x80-0x9F, with their glyph names. */
const CP1252_HIGH = {
  0x80: ['Euro', 0x20ac], 0x82: ['quotesinglbase', 0x201a], 0x83: ['florin', 0x0192], 0x84: ['quotedblbase', 0x201e],
  0x85: ['ellipsis', 0x2026], 0x86: ['dagger', 0x2020], 0x87: ['daggerdbl', 0x2021], 0x88: ['circumflex', 0x02c6],
  0x89: ['perthousand', 0x2030], 0x8a: ['Scaron', 0x0160], 0x8b: ['guilsinglleft', 0x2039], 0x8c: ['OE', 0x0152],
  0x8e: ['Zcaron', 0x017d], 0x91: ['quoteleft', 0x2018], 0x92: ['quoteright', 0x2019], 0x93: ['quotedblleft', 0x201c],
  0x94: ['quotedblright', 0x201d], 0x95: ['bullet', 0x2022], 0x96: ['endash', 0x2013], 0x97: ['emdash', 0x2014],
  0x98: ['tilde', 0x02dc], 0x99: ['trademark', 0x2122], 0x9a: ['scaron', 0x0161], 0x9b: ['guilsinglright', 0x203a],
  0x9c: ['oe', 0x0153], 0x9e: ['zcaron', 0x017e], 0x9f: ['Ydieresis', 0x0178],
};

const LATIN1_NAMES = [
  'nbspace', 'exclamdown', 'cent', 'sterling', 'currency', 'yen', 'brokenbar', 'section',
  'dieresis', 'copyright', 'ordfeminine', 'guillemotleft', 'logicalnot', 'softhyphen', 'registered', 'macron',
  'degree', 'plusminus', 'twosuperior', 'threesuperior', 'acute', 'mu', 'paragraph', 'periodcentered',
  'cedilla', 'onesuperior', 'ordmasculine', 'guillemotright', 'onequarter', 'onehalf', 'threequarters', 'questiondown',
  'Agrave', 'Aacute', 'Acircumflex', 'Atilde', 'Adieresis', 'Aring', 'AE', 'Ccedilla',
  'Egrave', 'Eacute', 'Ecircumflex', 'Edieresis', 'Igrave', 'Iacute', 'Icircumflex', 'Idieresis',
  'Eth', 'Ntilde', 'Ograve', 'Oacute', 'Ocircumflex', 'Otilde', 'Odieresis', 'multiply',
  'Oslash', 'Ugrave', 'Uacute', 'Ucircumflex', 'Udieresis', 'Yacute', 'Thorn', 'germandbls',
  'agrave', 'aacute', 'acircumflex', 'atilde', 'adieresis', 'aring', 'ae', 'ccedilla',
  'egrave', 'eacute', 'ecircumflex', 'edieresis', 'igrave', 'iacute', 'icircumflex', 'idieresis',
  'eth', 'ntilde', 'ograve', 'oacute', 'ocircumflex', 'otilde', 'odieresis', 'divide',
  'oslash', 'ugrave', 'uacute', 'ucircumflex', 'udieresis', 'yacute', 'thorn', 'ydieresis',
];

/** @type {Map<string, string>} */
const GLYPHS = new Map();
ASCII_NAMES.forEach((name, index) => GLYPHS.set(name, String.fromCharCode(0x20 + index)));
LATIN1_NAMES.forEach((name, index) => GLYPHS.set(name, String.fromCharCode(0xa0 + index)));
for (const [name, code] of Object.values(CP1252_HIGH)) GLYPHS.set(name, String.fromCharCode(code));
for (const [name, char] of Object.entries({
  minus: '−', fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', dotlessi: 'ı', Lslash: 'Ł', lslash: 'ł',
  quotedbl: '"', hyphentwo: '-', space: ' ', uni00A0: ' ', sfthyphen: '­', middot: '·', Delta: 'Δ', Omega: 'Ω',
  mu1: 'µ', fraction: '⁄', checkmark: '✓', arrowright: '→', arrowleft: '←',
})) {
  GLYPHS.set(name, char);
}

/**
 * Unicode text for a glyph name, or undefined when unknown.
 * Handles the uniXXXX, uXXXX[XX] conventions and suffixes such as "a.sc".
 * @param {string} name
 */
export function glyphToUnicode(name) {
  if (!name) return undefined;
  const known = GLYPHS.get(name);
  if (known) return known;
  const base = name.split('.')[0].split('_')[0];
  if (base !== name && GLYPHS.has(base)) return GLYPHS.get(base);
  let match = /^uni([0-9A-Fa-f]{4})+$/.exec(base);
  if (match) {
    const hex = base.slice(3);
    let text = '';
    for (let i = 0; i < hex.length; i += 4) text += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
    return text;
  }
  match = /^u([0-9A-Fa-f]{4,6})$/.exec(base);
  if (match) return String.fromCodePoint(Number.parseInt(match[1], 16));
  return undefined;
}

/** WinAnsiEncoding (the default for non-symbolic fonts in practice). */
export const WIN_ANSI = buildWinAnsi();

function buildWinAnsi() {
  const table = new Array(256).fill(undefined);
  for (let code = 0x20; code < 0x7f; code += 1) table[code] = String.fromCharCode(code);
  for (const [code, [, unicode]] of Object.entries(CP1252_HIGH)) table[Number(code)] = String.fromCharCode(unicode);
  for (let code = 0xa0; code <= 0xff; code += 1) table[code] = String.fromCharCode(code);
  table[0xad] = '-';
  return table;
}

/** Codes that differ from WinAnsi in StandardEncoding and MacRomanEncoding, for Latin text. */
const STANDARD_OVERRIDES = { 0x27: '’', 0x60: '‘' };
const MAC_ROMAN_HIGH =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø¿¡¬√ƒ≈∆«»… ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';

/**
 * Base encoding table by name.
 * @param {string | undefined} name
 */
export function baseEncoding(name) {
  if (name === 'MacRomanEncoding') {
    const table = WIN_ANSI.slice(0, 0x80).concat(new Array(128).fill(undefined));
    [...MAC_ROMAN_HIGH].forEach((char, index) => {
      table[0x80 + index] = char;
    });
    return table;
  }
  if (name === 'StandardEncoding') {
    const table = WIN_ANSI.slice();
    for (const [code, char] of Object.entries(STANDARD_OVERRIDES)) table[Number(code)] = char;
    return table;
  }
  return WIN_ANSI;
}

/** Helvetica advance widths for 0x20-0x7E (Adobe core font metrics), used when a standard font has no /Widths. */
const HELVETICA_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/**
 * Approximate width (1/1000 em) of a character in one of the 14 standard fonts.
 * @param {string} baseFont
 * @param {string | undefined} char
 */
export function standardFontWidth(baseFont, char) {
  if (/courier/i.test(baseFont)) return 600;
  const code = char ? char.charCodeAt(0) : 0;
  if (code >= 0x20 && code <= 0x7e) return HELVETICA_ASCII[code - 0x20];
  return 556;
}
