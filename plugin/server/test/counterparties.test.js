import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTestStore, addAccount } from './helpers.js';
import { registerBankStatement } from '../src/domain/documents.js';
import { findCategory, upsertRule } from '../src/domain/categories.js';
import { suggestCategoryFor } from '../src/domain/counterparties.js';
import { applyRulesToUncategorized, importCategories, learnExamples } from '../src/domain/category-import.js';
import { monthSummary } from '../src/domain/reports.js';
import { lookupCounterparty } from '../src/market/counterparty-service.js';
import { parseCompany } from '../src/market/brasilapi.js';
import { extractTaxId, formatTaxId, isValidCnpj, isValidCpf, parseTaxId } from '../src/lib/tax-id.js';

const CNPJ = '11222333000181';
const CPF = '52998224725';

let store;
let checking;

const statement = (transactions, period = { start: '2026-10-01', end: '2026-10-31' }) =>
  registerBankStatement(store, {
    account_id: checking.id,
    period_start: period.start,
    period_end: period.end,
    totals: { opening_balance: 0, closing_balance: transactions.reduce((acc, tx) => acc + tx.amount, 0) },
    transactions,
  });

const company = (overrides = {}) => ({
  razao_social: 'RESTAURANTE EXEMPLO LTDA',
  nome_fantasia: 'SABOR DA CASA',
  cnae_fiscal: 5611201,
  cnae_fiscal_descricao: 'Restaurantes e similares',
  descricao_situacao_cadastral: 'ATIVA',
  municipio: 'MACEIO',
  uf: 'AL',
  ...overrides,
});

function fakeFetch(payload, status = 200) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { impl, calls };
}

beforeEach(() => {
  store = createTestStore();
  checking = addAccount(store, { institution: 'Banco', type: 'checking', nickname: 'Banco' });
});

test('reconhece CPF e CNPJ válidos e mascara o CPF', () => {
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-82'), false);
  assert.equal(isValidCnpj('00000000000000'), false);
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-26'), false);
  assert.deepEqual(extractTaxId('PIX ENVIADO 11.222.333/0001-81 SABOR'), { kind: 'cnpj', digits: CNPJ });
  assert.deepEqual(extractTaxId(null, 'PIX RECEBIDO CPF 529.982.247-25'), { kind: 'cpf', digits: CPF });
  assert.equal(extractTaxId('PIX ***.982.247-** MARIA'), null);
  assert.equal(extractTaxId('PEDIDO 12345678901234'), null);
  assert.equal(formatTaxId({ kind: 'cpf', digits: CPF }), '***.982.247-**');
  assert.equal(formatTaxId({ kind: 'cnpj', digits: CNPJ }), '11.222.333/0001-81');
  assert.equal(parseTaxId('123'), null);
});

test('a regra ligada ao CNPJ reconhece a empresa mesmo com outro nome no extrato', () => {
  statement([{ date: '2026-10-03', description: `PIX ENVIADO ${CNPJ} SABOR DA CASA`, payee: 'SABOR DA CASA', amount: -80 }]);
  const tx = store.data.transactions[0];
  assert.deepEqual(tx.counterpartyTaxId, { kind: 'cnpj', digits: CNPJ });
  const food = findCategory(store.data.categories, 'Restaurantes');
  store.transact((data) => upsertRule(data.categoryRules, tx.payee, food.id, 'manual', tx.counterpartyTaxId));

  const result = statement(
    [{ date: '2026-11-04', description: `PIX ENVIADO 11.222.333/0001-81 REST EXEMPLO`, payee: 'REST EXEMPLO LTDA', amount: -50 }],
    { start: '2026-11-01', end: '2026-11-30' },
  );
  assert.equal(result.categorizedByRules.length, 1);
  assert.equal(result.categorizedByRules[0].category, 'Restaurantes');
});

test('lançamentos sem categoria mostram o CNPJ e pedem a pesquisa', () => {
  const result = statement([
    { date: '2026-10-03', description: `PIX ENVIADO ${CNPJ}`, payee: 'EMPRESA', amount: -30 },
    { date: '2026-10-04', description: `PIX ENVIADO CPF ${CPF}`, payee: 'PESSOA', amount: -20 },
  ]);
  assert.deepEqual(result.uncategorized.map((tx) => tx.counterparty?.id), ['11.222.333/0001-81', '***.982.247-**']);
  assert.ok(result.nextSteps.some((step) => step.includes('lookup_counterparty')));
});

test('pesquisa o CNPJ, sugere a categoria e guarda na memória', async () => {
  statement([{ date: '2026-10-03', description: `PIX ENVIADO ${CNPJ}`, payee: 'EMPRESA', amount: -30 }]);
  const tx = store.data.transactions[0];
  const fetch = fakeFetch(company());
  const first = await lookupCounterparty(store, { transaction_id: tx.id }, { fetchImpl: fetch.impl });
  assert.equal(first.found, true);
  assert.equal(first.cached, false);
  assert.equal(first.tradeName, 'SABOR DA CASA');
  assert.equal(first.suggestion.category, 'Alimentação > Restaurantes');
  assert.equal(fetch.calls.length, 1);
  assert.match(fetch.calls[0], /\/cnpj\/v1\/11222333000181$/);

  const second = await lookupCounterparty(store, { tax_id: '11.222.333/0001-81' }, { fetchImpl: fetch.impl });
  assert.equal(second.cached, true);
  assert.equal(fetch.calls.length, 1);
  assert.equal(store.data.counterparties.length, 1);
  await lookupCounterparty(store, { tax_id: CNPJ, refresh: true }, { fetchImpl: fetch.impl });
  assert.equal(fetch.calls.length, 2);
});

test('nunca consulta CPF e trata CNPJ inexistente e entradas inválidas', async () => {
  const fetch = fakeFetch(null, 404);
  const person = await lookupCounterparty(store, { tax_id: CPF }, { fetchImpl: fetch.impl });
  assert.equal(person.kind, 'cpf');
  assert.equal(person.taxId, '***.982.247-**');
  assert.equal(fetch.calls.length, 0);
  const missing = await lookupCounterparty(store, { tax_id: CNPJ }, { fetchImpl: fetch.impl });
  assert.equal(missing.found, false);
  await assert.rejects(lookupCounterparty(store, { tax_id: '123' }, { fetchImpl: fetch.impl }), /inválido/);
  await assert.rejects(lookupCounterparty(store, {}, { fetchImpl: fetch.impl }), /tax_id ou transaction_id/);
  const failing = fakeFetch({}, 500);
  await assert.rejects(lookupCounterparty(store, { tax_id: CNPJ }, { fetchImpl: failing.impl }), /HTTP 500/);
  assert.throws(() => parseCompany({}, CNPJ), /Unexpected/);
});

test('sugestão por marca conhecida e por atividade, respeitando as categorias do usuário', () => {
  const categories = store.data.categories;
  assert.equal(suggestCategoryFor(categories, { name: 'IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.', activity: { code: '8299799' } }).category, 'Alimentação > Delivery');
  assert.equal(suggestCategoryFor(categories, { name: 'POSTO X', activity: { code: '4731800' } }).category, 'Transporte > Combustível');
  assert.equal(suggestCategoryFor(categories, { name: 'EMPRESA', activity: { code: '0111301' } }), null);
  const fuel = findCategory(categories, 'Combustível');
  store.transact(() => {
    fuel.active = false;
  });
  assert.equal(suggestCategoryFor(store.data.categories, { name: 'POSTO X', activity: { code: '4731800' } }), null);
});

test('importa a lista de categorias do usuário e os exemplos de identificação', () => {
  const imported = store.transact((data) =>
    importCategories(data, [
      { kind: 'income', group: 'Receitas', name: 'Colaboração' },
      { kind: 'income', group: 'Receitas', name: 'Salário' },
    ]),
  );
  assert.deepEqual(imported, { created: ['Colaboração'], reactivated: [], existing: ['Salário'] });
  assert.throws(() => store.transact((data) => importCategories(data, [{ kind: 'expense', group: 'X', name: 'Salário' }])), /já existe/);

  statement([
    { date: '2026-10-05', description: `PIX RECEBIDO ${CNPJ} EMPRESA`, payee: 'EMPRESA', amount: 3000 },
    { date: '2026-10-06', description: 'PIX ENVIADO PADARIA DO ZE', payee: 'PADARIA DO ZE', amount: -15 },
  ]);
  const learned = store.transact((data) =>
    learnExamples(data, [
      { tax_id: '11.222.333/0001-81', category: 'Distribuição de lucros' },
      { payee: 'Padaria do Zé', category: 'Padaria e café' },
    ]),
  );
  assert.equal(learned.length, 2);
  assert.equal(store.transact((data) => applyRulesToUncategorized(data)), 2);
  const names = new Map(store.data.categories.map((c) => [c.id, c.name]));
  assert.deepEqual(store.data.transactions.map((tx) => names.get(tx.categoryId)), ['Distribuição de lucros', 'Padaria e café']);
  assert.throws(() => store.transact((data) => learnExamples(data, [{ tax_id: '1', category: 'Salário' }])), /inválido/);
  assert.throws(() => store.transact((data) => learnExamples(data, [{ category: 'Salário' }])), /payee ou tax_id/);
  assert.throws(() => store.transact((data) => learnExamples(data, [{ payee: 'X', category: 'Nada' }])), /não encontrada/);
});

test('o resumo do mês separa entradas e saídas por categoria com a participação', () => {
  statement([
    { date: '2026-10-05', description: 'SALARIO', payee: 'EMPREGADOR', amount: 4000 },
    { date: '2026-10-06', description: 'LUCROS', payee: 'MINHA EMPRESA', amount: 1000 },
    { date: '2026-10-07', description: 'MERCADO', payee: 'MERCADO', amount: -300 },
    { date: '2026-10-08', description: 'FARMACIA', payee: 'FARMACIA', amount: -100 },
  ]);
  const ids = (name) => findCategory(store.data.categories, name).id;
  store.transact((data) => {
    const map = ['Salário', 'Distribuição de lucros', 'Mercado', 'Farmácia'];
    data.transactions.forEach((tx, index) => {
      tx.categoryId = ids(map[index]);
    });
  });
  const summary = monthSummary(store.data, '2026-10');
  assert.deepEqual(summary.income, [
    { category: 'Receitas > Salário', amountCents: 400000, shareBps: 8000 },
    { category: 'Receitas > Distribuição de lucros', amountCents: 100000, shareBps: 2000 },
  ]);
  assert.deepEqual(summary.expenses, [
    { category: 'Alimentação > Mercado', amountCents: -30000, shareBps: 7500 },
    { category: 'Saúde > Farmácia', amountCents: -10000, shareBps: 2500 },
  ]);
  assert.deepEqual(monthSummary(store.data, '2026-12').income, []);
});
