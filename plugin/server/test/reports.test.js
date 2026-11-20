import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestStore, addAccount } from './helpers.js';
import { registerBankStatement, registerCardInvoice } from '../src/domain/documents.js';
import { cashFlow, commitments, monthSummary } from '../src/domain/reports.js';
import { buildMonthlyPackage } from '../src/domain/closing.js';

let store;
let checking;
let card;

beforeEach(() => {
  store = createTestStore();
  checking = addAccount(store, { institution: 'Banco', type: 'checking', nickname: 'Banco' });
  card = addAccount(store, { institution: 'Cartao', type: 'credit_card', nickname: 'Cartao', toleranceCents: 5 });
  registerCardInvoice(store, {
    account_id: card.id,
    period_start: '2026-09-10',
    period_end: '2026-10-10',
    due_date: '2026-10-10',
    totals: { total: 600 },
    transactions: [
      { date: '2026-09-28', description: 'Restaurante', payee: 'Restaurante', amount: 200 },
      { date: '2026-09-29', description: 'Loja - Parcela 1/4', payee: 'Loja', amount: 400, installment: { number: 1, total: 4 } },
    ],
  });
  registerBankStatement(store, {
    account_id: checking.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 0, closing_balance: 4400 },
    transactions: [
      { date: '2026-10-05', description: 'Salario', payee: 'Empresa', amount: 5000 },
      { date: '2026-10-10', description: 'Pagamento fatura cartao', payee: 'Cartao', amount: -600 },
    ],
  });
});

test('competence view places card purchases in the purchase month', () => {
  const [september, october] = cashFlow(store.data, { fromMonth: '2026-09', toMonth: '2026-10', view: 'competence' });
  assert.equal(september.expenseCents, -60000);
  assert.equal(october.expenseCents, 0);
  assert.equal(october.incomeCents, 500000);
});

test('cash view places card purchases in the invoice payment month and ignores the payment itself', () => {
  const [september, october] = cashFlow(store.data, { fromMonth: '2026-09', toMonth: '2026-10', view: 'cash' });
  assert.equal(september.expenseCents, 0);
  assert.equal(october.expenseCents, -60000, 'invoice payment is not counted twice');
  assert.equal(october.netCents, 440000);
});

test('commitments list the remaining installments by month', () => {
  const list = commitments(store.data, '2026-11', 3);
  assert.deepEqual(list.map((month) => month.totalCents), [-40000, -40000, -40000]);
});

test('month summary reports uncategorized transactions', () => {
  const summary = monthSummary(store.data, '2026-10');
  assert.equal(summary.cash.netCents, 440000);
  assert.equal(summary.uncategorizedCount, 1);
});

test('monthly package exposes ready numbers and data gaps', () => {
  store.transact((data) => {
    data.goals.push({ id: 'goal_1', name: 'Viagem', targetCents: 1200000, currentCents: 0, deadline: '2027-10-31', priority: 1, active: true });
  });
  const pkg = buildMonthlyPackage(store.data, '2026-10', '2026-11-05');
  assert.equal(pkg.cashFlow.monthNetCents, 440000);
  assert.equal(pkg.commitments[0].totalCents, -40000);
  assert.equal(pkg.availableForInvestmentCents, 400000);
  assert.equal(pkg.goals[0].monthsLeft, 12);
  assert.ok(pkg.goals[0].requiredMonthlyCents > 90000 && pkg.goals[0].requiredMonthlyCents < 100000);
  assert.ok(pkg.dataGaps.some((gap) => gap.includes('Perfil')));
});
