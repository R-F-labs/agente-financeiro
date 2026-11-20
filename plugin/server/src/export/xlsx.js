import { createZip } from './zip.js';

/**
 * Cell value accepted by the writer.
 * - string: inline text
 * - number: plain number
 * - { money: cents }: currency formatted as R$
 * - { percent: ratio }: percentage
 * - { date: 'YYYY-MM-DD' }: date
 * @typedef {string|number|null|undefined|{ money: number }|{ percent: number }|{ date: string }} Cell
 */

const STYLE = { header: 1, money: 2, percent: 3, date: 4 };

/**
 * Writes a minimal but valid XLSX workbook (OOXML) with bold headers,
 * currency, percentage and date formats.
 * @param {Array<{ name: string, columns: Array<{ header: string, width?: number }>, rows: Cell[][] }>} sheets
 * @returns {Buffer}
 */
export function buildWorkbook(sheets) {
  const files = [
    { name: '[Content_Types].xml', content: contentTypes(sheets.length) },
    { name: '_rels/.rels', content: rootRels() },
    { name: 'xl/workbook.xml', content: workbook(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels(sheets.length) },
    { name: 'xl/styles.xml', content: styles() },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheet(sheet) })),
  ];
  return createZip(files);
}

function worksheet(sheet) {
  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 18}" customWidth="1"/>`)
    .join('');
  const header = row(1, sheet.columns.map((column) => column.header), STYLE.header);
  const body = sheet.rows.map((cells, index) => row(index + 2, cells)).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${cols}</cols><sheetData>${header}${body}</sheetData></worksheet>`
  );
}

function row(rowNumber, cells, forcedStyle) {
  const xml = cells.map((cell, index) => cellXml(`${columnName(index)}${rowNumber}`, cell, forcedStyle)).join('');
  return `<row r="${rowNumber}">${xml}</row>`;
}

function cellXml(ref, cell, forcedStyle) {
  if (cell === null || cell === undefined || cell === '') return '';
  const style = forcedStyle ? ` s="${forcedStyle}"` : '';
  if (typeof cell === 'number') return `<c r="${ref}"${style}><v>${cell}</v></c>`;
  if (typeof cell === 'string') return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  if ('money' in cell) return `<c r="${ref}" s="${STYLE.money}"><v>${cell.money / 100}</v></c>`;
  if ('percent' in cell) return `<c r="${ref}" s="${STYLE.percent}"><v>${cell.percent}</v></c>`;
  if ('date' in cell) return `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(cell.date)}</v></c>`;
  return '';
}

function excelSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function columnName(index) {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function contentTypes(count) {
  const overrides = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    `${overrides}</Types>`
  );
}

function rootRels() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'
  );
}

function workbook(sheets) {
  const entries = sheets
    .map((sheet, i) => `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets>${entries}</sheets></workbook>`
  );
}

function workbookRels(count) {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  ).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `${sheets}<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'
  );
}

function styles() {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  );
}
