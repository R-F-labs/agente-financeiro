import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildWorkbook } from '../src/export/xlsx.js';
import { crc32 } from '../src/export/zip.js';

/** Reads the entries of a ZIP buffer through its central directory. */
function readZip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const entries = {};
  for (let i = 0; i < count; i += 1) {
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const start = localOffset + 30 + localNameLength;
    const content = inflateRawSync(buffer.subarray(start, start + compressedSize));
    assert.equal(crc32(content), crc, `crc of ${name}`);
    entries[name] = content.toString('utf8');
    cursor += 46 + nameLength;
  }
  return entries;
}

test('workbook is a valid OOXML package with typed cells', () => {
  const buffer = buildWorkbook([
    {
      name: 'Lançamentos',
      columns: [{ header: 'Data' }, { header: 'Descrição' }, { header: 'Valor' }],
      rows: [[{ date: '2026-10-05' }, 'Salário & bônus <teste>', { money: 500000 }]],
    },
  ]);
  const entries = readZip(buffer);
  assert.ok(entries['[Content_Types].xml'].includes('worksheet+xml'));
  assert.ok(entries['xl/workbook.xml'].includes('Lançamentos'));
  const sheet = entries['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes('<v>46300</v>'), 'date serial for 2026-10-05');
  assert.ok(sheet.includes('<v>5000</v>'), 'money in reais');
  assert.ok(sheet.includes('Salário &amp; bônus &lt;teste&gt;'));
});
