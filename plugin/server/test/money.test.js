import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatBRL, splitCents } from '../src/lib/money.js';

test('toCents parses numbers without floating point drift', () => {
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(1234.56), 123456);
  assert.equal(toCents(-21.6), -2160);
});

test('toCents parses Brazilian formatted strings', () => {
  assert.equal(toCents('R$ 1.234,56'), 123456);
  assert.equal(toCents('-R$ 1.234,09'), -123409);
  assert.equal(toCents('−R$ 1.111,97'), -111197);
  assert.equal(toCents('- 1.111,97'), -111197);
  assert.equal(toCents('72.345,67'), 7234567);
  assert.equal(toCents('1.234'), 123400);
  assert.equal(toCents('10,5'), 1050);
});

test('toCents parses international formatted strings', () => {
  assert.equal(toCents('1,234.56'), 123456);
  assert.equal(toCents('277.77'), 27777);
});

test('toCents rejects invalid values', () => {
  assert.throws(() => toCents('abc'));
  assert.throws(() => toCents(''));
  assert.throws(() => toCents(Number.NaN));
});

test('formatBRL formats cents', () => {
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(-5), '-R$ 0,05');
  assert.equal(formatBRL(100000000), 'R$ 1.000.000,00');
});

test('splitCents keeps the exact total', () => {
  assert.deepEqual(splitCents(1000, 3), [334, 333, 333]);
  assert.deepEqual(splitCents(-1000, 3), [-334, -333, -333]);
  assert.equal(splitCents(98765, 7).reduce((a, b) => a + b, 0), 98765);
});
