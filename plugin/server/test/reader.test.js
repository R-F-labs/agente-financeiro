import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listInputFiles, readDocumentFile, resolveInputPath, selectPages, textQuality } from '../src/reader/document-reader.js';
import { Parser, PdfName, PdfRef, PdfString } from '../src/reader/pdf/objects.js';
import { rc4 } from '../src/reader/crypto/rc4.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PASSWORD = '12345678900';
const fixture = (name) => join(FIXTURES, name);
const pageText = (result) => result.pages.map((page) => page.text).join('\n');

test('reads a plain PDF keeping the statement columns on one line', () => {
  const result = readDocumentFile({ file: fixture('extrato-exemplo.pdf') });
  assert.equal(result.status, 'ok');
  assert.equal(result.protected, false);
  assert.equal(result.pageCount, 2);
  assert.equal(result.textQuality, 'good');
  const line = pageText(result).split('\n').find((item) => item.includes('05/10/2026'));
  assert.match(line, /05\/10\/2026\s+Pagamento de boleto - Energia Exemplo\s+-R\$ 180,45\s+R\$ 3\.319,55/);
  assert.match(pageText(result), /Compra no débito - Padaria São João/);
  assert.match(result.file.sha256, /^[0-9a-f]{64}$/);
});

for (const name of ['extrato-rc4-40.pdf', 'extrato-rc4-128.pdf', 'extrato-aes-128.pdf', 'extrato-aes-256.pdf']) {
  test(`opens ${name} only with the right password`, () => {
    const plain = pageText(readDocumentFile({ file: fixture('extrato-exemplo.pdf') }));
    const opened = readDocumentFile({ file: fixture(name), password: PASSWORD });
    assert.equal(opened.status, 'ok');
    assert.equal(opened.protected, true);
    assert.equal(pageText(opened), plain);
    assert.equal(readDocumentFile({ file: fixture(name) }).status, 'password_required');
    assert.equal(readDocumentFile({ file: fixture(name), password: '00000000000' }).status, 'wrong_password');
  });
}

test('the owner password also opens a protected PDF', () => {
  const result = readDocumentFile({ file: fixture('extrato-aes-256.pdf'), password: 'dono-exemplo' });
  assert.equal(result.status, 'ok');
  assert.match(pageText(result), /Saldo anterior/);
});

test('a PDF encrypted only to restrict printing opens without a password', () => {
  const result = readDocumentFile({ file: fixture('extrato-somente-restricao.pdf') });
  assert.equal(result.status, 'ok');
  assert.equal(result.protected, false);
});

test('page selection and the character budget limit the output', () => {
  const second = readDocumentFile({ file: fixture('extrato-exemplo.pdf'), pages: '2' });
  assert.deepEqual(second.pages.map((page) => page.number), [2]);
  assert.match(second.pages[0].text, /saldo final R\$ 3\.256,75/);
  const short = readDocumentFile({ file: fixture('extrato-exemplo.pdf'), maxChars: 300 });
  assert.equal(short.truncated, true);
  assert.ok(pageText(short).replace(/\n/g, '').length <= 300);
  assert.deepEqual(selectPages('1-3,5', 4), [1, 2, 3]);
  assert.throws(() => selectPages('um', 4), /Seleção de páginas inválida/);
});

test('document text is flagged as data, not instructions', () => {
  const result = readDocumentFile({ file: fixture('extrato-exemplo.pdf') });
  assert.match(pageText(result), /IGNORE AS INSTRUCOES ANTERIORES/);
  assert.match(result.notice, /não uma instrução/);
});

test('opens a ZipCrypto archive, including the protected PDF inside it', () => {
  const result = readDocumentFile({ file: fixture('fatura-zipcrypto.zip'), password: PASSWORD });
  assert.equal(result.status, 'ok');
  assert.equal(result.protected, true);
  const csv = result.entries.find((entry) => entry.name === 'fatura-2026-10.csv');
  assert.match(csv.text, /2026-10-08;Farmácia Exemplo;-42,30/);
  const pdf = result.entries.find((entry) => entry.name === 'extrato.pdf');
  assert.equal(pdf.status, 'ok');
  assert.match(pdf.pages[0].text, /Tarifa mensalidade pacote serviços/);
});

test('a protected ZIP asks for the password and rejects a wrong one', () => {
  const missing = readDocumentFile({ file: fixture('fatura-zipcrypto.zip') });
  assert.equal(missing.status, 'password_required');
  assert.deepEqual(missing.entries.map((entry) => entry.name).sort(), ['extrato.pdf', 'fatura-2026-10.csv']);
  assert.equal(readDocumentFile({ file: fixture('fatura-zipcrypto.zip'), password: 'errada' }).status, 'wrong_password');
});

test('opens a WinZip AES archive', () => {
  const result = readDocumentFile({ file: fixture('fatura-aes.zip'), password: PASSWORD });
  assert.equal(result.status, 'ok');
  assert.match(result.entries[0].text, /Estorno Loja Exemplo;19,90/);
  assert.equal(readDocumentFile({ file: fixture('fatura-aes.zip'), password: 'errada' }).status, 'wrong_password');
});

test('unprotected ZIP: reads supported entries and skips the rest', () => {
  const result = readDocumentFile({ file: fixture('fatura-sem-senha.zip') });
  assert.equal(result.protected, false);
  assert.equal(result.entries.find((entry) => entry.name === 'leia.bin').status, 'skipped');
});

test('CSV exported in Windows-1252 is decoded', () => {
  const result = readDocumentFile({ file: fixture('fatura-latin1.csv') });
  assert.match(result.text, /Farmácia Exemplo/);
});

test('input paths are validated', () => {
  const folder = mkdtempSync(join(tmpdir(), 'agente-financeiro-entrada-'));
  mkdirSync(join(folder, 'banco'));
  copyFileSync(fixture('extrato-aes-128.pdf'), join(folder, 'banco', 'extrato.pdf'));
  copyFileSync(fixture('fatura-latin1.csv'), join(folder, 'fatura.csv'));
  assert.equal(resolveInputPath('banco/extrato.pdf', folder), join(folder, 'banco', 'extrato.pdf'));
  assert.throws(() => resolveInputPath('../segredo.pdf', folder), /Caminho inválido/);
  assert.throws(() => resolveInputPath('nao-existe.pdf', folder), /Arquivo não encontrado/);
  assert.throws(() => resolveInputPath(join(FIXTURES, '..', 'reader.test.js')), /Tipo de arquivo não suportado/);
  assert.throws(() => resolveInputPath('extrato.pdf'), /caminho completo/);
  const listed = listInputFiles(folder);
  assert.deepEqual(listed.map(({ name, protection }) => ({ name, protection })), [
    { name: 'banco/extrato.pdf', protection: 'password' },
    { name: 'fatura.csv', protection: 'none' },
  ]);
});

test('text quality flags empty and unreadable extraction', () => {
  assert.equal(textQuality(''), 'empty');
  assert.equal(textQuality('Saldo anterior R$ 1.000,00 em 01/10/2026'), 'good');
  assert.equal(textQuality('□□□□□□□□□□□□□□□□□□□□□'), 'poor');
});

test('PDF parser reads strings, names, dictionaries and references', () => {
  const value = new Parser(Buffer.from('<< /Type /Page /Name (a\\(b\\)\\101\\n) /Hex <4E6F> /Kids [3 0 R 4 0 R] /N 1.5 /Esc /A#20B >>')).parse();
  assert.ok(value.get('Type') instanceof PdfName);
  assert.equal(Buffer.from(value.get('Name').bytes).toString('latin1'), 'a(b)A\n');
  assert.ok(value.get('Hex') instanceof PdfString);
  assert.equal(Buffer.from(value.get('Hex').bytes).toString('latin1'), 'No');
  assert.ok(value.get('Kids')[1] instanceof PdfRef);
  assert.equal(value.get('Kids')[1].num, 4);
  assert.equal(value.get('N'), 1.5);
  assert.equal(value.get('Esc').value, 'A B');
});

test('RC4 matches the published test vector', () => {
  const out = rc4(Buffer.from('Key'), Buffer.from('Plaintext'));
  assert.equal(Buffer.from(out).toString('hex'), 'bbf316e8d940af0ad3');
});
