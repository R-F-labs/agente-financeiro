import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBankStatement, validateCardInvoice, validateInvestmentStatement } from '../src/domain/validation.js';

const lines = [
  { date: '2026-11-05', description: 'Pix recebido', amountCents: 40000, balanceAfterCents: -110000 },
  { date: '2026-11-09', description: 'Pix enviado', amountCents: -2000, balanceAfterCents: -112000 },
  { date: '2026-11-10', description: 'Pix enviado', amountCents: -2000, balanceAfterCents: -114000 },
  { date: '2026-11-10', description: 'Remuneracao aplicacao automatica', amountCents: 2, balanceAfterCents: -113998 },
];

test('bank statement passes all three checks when consistent', () => {
  const result = validateBankStatement(
    { openingBalanceCents: -150000, closingBalanceCents: -113998, inflowsCents: 40002, outflowsCents: 4000 },
    lines,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((check) => check.key),
    ['saldo_inicial_mais_movimentos', 'entradas', 'saidas', 'cadeia_de_saldos'],
  );
});

test('bank statement pinpoints the line where the balance chain breaks', () => {
  const missing = [lines[0], lines[2], lines[3]];
  const result = validateBankStatement({ openingBalanceCents: -150000, closingBalanceCents: -113998 }, missing);
  assert.equal(result.ok, false);
  const chain = result.checks.find((check) => check.key === 'cadeia_de_saldos');
  assert.equal(chain.ok, false);
  assert.match(chain.detail, /linha 2/);
});

test('card invoice formula with previous balance and payment', () => {
  const result = validateCardInvoice(
    { totalCents: 500000, previousBalanceCents: 120000, previousPaymentCents: -120000 },
    [
      { amountCents: 499000, lineType: 'purchase' },
      { amountCents: 1500, lineType: 'iof' },
      { amountCents: -500, lineType: 'refund' },
      { amountCents: 120000, lineType: 'previous_balance' },
      { amountCents: -120000, lineType: 'previous_payment' },
    ],
  );
  assert.equal(result.ok, true);
});

test('card invoice tolerance absorbs a one cent rounding printed by the issuer', () => {
  const lines = [{ amountCents: 499999, lineType: 'purchase' }];
  assert.equal(validateCardInvoice({ totalCents: 500000 }, lines, 0).ok, false);
  assert.equal(validateCardInvoice({ totalCents: 500000 }, lines, 5).ok, true);
});

test('investment statement validates each position and the total', () => {
  const result = validateInvestmentStatement({ closingTotalCents: 1060000 }, [
    { asset: 'CDB X', openingCents: 1000000, contributionsCents: 50000, withdrawalsCents: 0, incomeCents: 12000, taxesAndFeesCents: 2000, closingCents: 1060000 },
  ]);
  assert.equal(result.ok, true);
});
