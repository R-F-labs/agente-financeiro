import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestStore, addAccount } from './helpers.js';
import { registerBankStatement, registerCardInvoice, registerInvestmentStatement } from '../src/domain/documents.js';
import { upsertRule } from '../src/domain/categories.js';

/** @type {import('../src/storage/store.js').Store} */
let store;
let checking;
let card;
let broker;

beforeEach(() => {
  store = createTestStore();
  checking = addAccount(store, { institution: 'Santander', type: 'checking', nickname: 'Santander' });
  card = addAccount(store, { institution: 'Nubank', type: 'credit_card', nickname: 'Nubank', toleranceCents: 5 });
  broker = addAccount(store, { institution: 'Corretora', type: 'investment', nickname: 'Corretora' });
  store.transact((data) => {
    data.profile = { ownerName: 'Maria Aparecida Souza Lima' };
  });
});

function statement(overrides = {}) {
  // Reverse chronological, as printed by the bank.
  return {
    account_id: checking.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 1000, closing_balance: 1373.4, inflows: 3881, outflows: 3507.6 },
    transactions: [
      { date: '2026-10-20', description: 'Pix enviado Maria Aparecida Sou', payee: 'Maria Aparecida Sou', amount: -500, balance_after: 1373.4 },
      { date: '2026-10-15', description: 'Pix enviado Metro Exemplo', payee: 'Metro Exemplo', amount: -21.6, balance_after: 1873.4 },
      { date: '2026-10-15', description: 'Pix enviado Metro Exemplo', payee: 'Metro Exemplo', amount: -21.6, balance_after: 1895 },
      { date: '2026-10-10', description: 'Pagamento cartao de credito', payee: 'Nubank', amount: -2964.4, balance_after: 1916.6 },
      { date: '2026-10-05', description: 'Pix recebido Empresa Exemplo', payee: 'Empresa Exemplo', amount: 3881, balance_after: 4881 },
    ],
    ...overrides,
  };
}

test('registers a consistent bank statement and keeps same-day identical charges', () => {
  const result = registerBankStatement(store, statement());
  assert.equal(result.status, 'registered');
  assert.equal(result.added, 5);
  const metro = store.get('transactions').filter((tx) => tx.payee === 'Metro Exemplo');
  assert.equal(metro.length, 2, 'two identical charges on the same day are both kept');
});

test('rejects a statement that does not match its totals and saves nothing', () => {
  const input = statement();
  input.transactions.splice(1, 1);
  const result = registerBankStatement(store, input);
  assert.equal(result.status, 'validation_failed');
  assert.equal(result.saved, false);
  assert.equal(store.get('transactions').length, 0);
  assert.equal(store.get('documents').length, 0);
});

test('force saves a statement the user reviewed', () => {
  const input = statement();
  input.transactions.splice(1, 1);
  const result = registerBankStatement(store, { ...input, force: true });
  assert.equal(result.status, 'registered_with_differences');
  assert.equal(store.get('transactions').length, 4);
});

test('overlapping statements do not duplicate transactions', () => {
  registerBankStatement(store, statement());
  const second = registerBankStatement(store, statement());
  assert.equal(second.added, 0);
  assert.equal(second.duplicatesSkipped, 5);
  assert.equal(store.get('transactions').length, 5);
});

test('own-name Pix becomes a provisional transfer with a pending question', () => {
  registerBankStatement(store, statement());
  const tx = store.get('transactions').find((item) => item.payee === 'Maria Aparecida Sou');
  assert.equal(tx.nature, 'transfer');
  assert.equal(tx.provisional, true);
  assert.ok(store.get('pending').some((item) => item.type === 'own_transfer_unmatched' && item.transactionId === tx.id));
});

test('learned rules categorize new transactions automatically', () => {
  const transport = store.get('categories').find((category) => category.name === 'Aplicativos de transporte');
  store.transact((data) => upsertRule(data.categoryRules, 'Metro Exemplo', transport.id, 'manual'));
  const result = registerBankStatement(store, statement());
  assert.equal(result.categorizedByRules.length, 2);
  assert.ok(store.get('transactions').filter((tx) => tx.payee === 'Metro Exemplo').every((tx) => tx.categoryId === transport.id));
});

function invoice(overrides = {}) {
  return {
    account_id: card.id,
    period_start: '2026-09-10',
    period_end: '2026-10-10',
    due_date: '2026-10-10',
    totals: { total: 2964.4, previous_balance: 1000, previous_payment: -1000 },
    transactions: [
      { date: '2026-09-10', description: 'Fatura anterior', amount: 1000, line_type: 'previous_balance' },
      { date: '2026-09-12', description: 'Pagamento em 12 SET', amount: -1000, line_type: 'previous_payment' },
      { date: '2026-09-15', description: 'Loja Exemplo - Parcela 1/3', payee: 'Loja Exemplo', amount: 300, card_last4: '1234', installment: { number: 1, total: 3 } },
      { date: '2026-09-20', description: 'Mercado Bom Preco', payee: 'Mercado Bom Preco', amount: 1288.04, card_last4: '1234' },
      {
        date: '2026-09-25',
        description: 'Pix no credito - Joao Exemplo',
        payee: 'Joao Exemplo',
        amount: 376.36,
        line_type: 'financing',
        financed: { principal: 350, charges: 26.36 },
      },
      { date: '2026-09-28', description: 'Servico Internacional', payee: 'Servico Internacional', amount: 990, card_last4: '1234' },
      { date: '2026-09-28', description: 'IOF de "Servico Internacional"', amount: 10, line_type: 'iof' },
    ],
    ...overrides,
  };
}

test('card invoice creates installment forecasts and splits credit Pix charges', () => {
  const result = registerCardInvoice(store, invoice());
  assert.equal(result.status, 'registered');
  assert.equal(result.forecastsCreated, 2);
  const forecasts = store.get('transactions').filter((tx) => tx.status === 'forecast');
  assert.deepEqual(forecasts.map((tx) => tx.installment.number), [2, 3]);
  assert.deepEqual(forecasts.map((tx) => tx.cashDate), ['2026-11-10', '2026-12-10']);
  const charges = store.get('transactions').find((tx) => tx.description.startsWith('Juros e IOF'));
  assert.equal(charges.amountCents, -2636);
  assert.equal(charges.debtCost, true);
  assert.equal(store.get('transactions').filter((tx) => tx.lineType === 'previous_balance').length, 0);
});

test('next invoice confirms the forecast instead of duplicating it', () => {
  registerCardInvoice(store, invoice());
  const next = registerCardInvoice(store, {
    account_id: card.id,
    period_start: '2026-10-10',
    period_end: '2026-11-10',
    due_date: '2026-11-10',
    totals: { total: 300 },
    transactions: [{ date: '2026-10-15', description: 'Loja Exemplo - Parcela 2/3', payee: 'Loja Exemplo', amount: 300, installment: { number: 2, total: 3 } }],
  });
  assert.equal(next.installmentsConfirmed, 1);
  assert.equal(next.forecastsCreated, 0);
  const group = store.get('transactions').filter((tx) => tx.payee === 'Loja Exemplo');
  assert.equal(group.length, 3);
  assert.equal(group.filter((tx) => tx.status === 'forecast').length, 1);
});

test('bank debit equal to the invoice total is reconciled as the invoice payment', () => {
  registerCardInvoice(store, invoice());
  registerBankStatement(store, statement());
  const payment = store.get('transactions').find((tx) => tx.payee === 'Nubank');
  assert.equal(payment.nature, 'card_payment');
  const purchase = store.get('transactions').find((tx) => tx.payee === 'Mercado Bom Preco');
  assert.equal(purchase.cashDate, '2026-10-10');
  assert.ok(!store.get('pending').some((item) => item.type === 'card_payment_unmatched' && item.transactionId === payment.id));
});

test('transfer between own accounts is linked and leaves the cash flow', () => {
  const savings = addAccount(store, { institution: 'Outro Banco', type: 'checking', nickname: 'Outro Banco' });
  registerBankStatement(store, statement());
  const result = registerBankStatement(store, {
    account_id: savings.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 0, closing_balance: 500 },
    transactions: [{ date: '2026-10-21', description: 'Pix recebido Maria Aparecida', amount: 500 }],
  });
  assert.equal(result.reconciliation.transfers, 1);
  const pair = store.get('transactions').filter((tx) => Math.abs(tx.amountCents) === 50000);
  assert.ok(pair.every((tx) => tx.nature === 'transfer' && tx.linkedTransactionId));
  assert.ok(!store.get('pending').some((item) => item.status === 'open' && item.type === 'own_transfer_unmatched'));
});

test('investment statement creates assets, positions and a classification pending', () => {
  const result = registerInvestmentStatement(store, {
    account_id: broker.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { closing_total: 10600 },
    positions: [{ asset: 'CDB BANCO X 110% CDI', opening: 10000, contributions: 500, income: 120, taxes_and_fees: 20, closing: 10600 }],
  });
  assert.equal(result.status, 'registered');
  assert.equal(store.get('positions').length, 1);
  assert.equal(store.get('positions')[0].month, '2026-10');
  assert.ok(store.get('pending').some((item) => item.type === 'asset_unmapped'));
});
