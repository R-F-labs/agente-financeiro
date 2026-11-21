import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../src/guardrails/confirmation.js';
import { ToolRegistry } from '../src/mcp/registry.js';
import { allTools } from '../src/tools/index.js';
import { exportReports } from '../src/export/workbooks.js';
import { addAccount, createTestStore } from './helpers.js';

function registry() {
  return new ToolRegistry().register(allTools());
}

async function call(target, name, args = {}) {
  const result = await target.call(name, args);
  return { ...result, data: result.structuredContent };
}

test('confirmation tokens are single use and bound to the exact arguments', () => {
  let now = 1_000;
  const gate = new ConfirmationGate({ ttlMs: 500, now: () => now });
  const token = gate.issue('restore_backup', { backup_id: 'a' });
  assert.equal(gate.consume('restore_backup', { backup_id: 'b', confirmation_token: token }, token), false);
  const second = gate.issue('restore_backup', { backup_id: 'a' });
  assert.equal(gate.consume('restore_backup', { backup_id: 'a', confirmation_token: second }, second), true);
  assert.equal(gate.consume('restore_backup', { backup_id: 'a' }, second), false);
  const late = gate.issue('restore_backup', { backup_id: 'a' });
  now += 501;
  assert.equal(gate.consume('restore_backup', { backup_id: 'a' }, late), false);
});

test('every tool declares annotations and write tools state whether they are destructive', () => {
  for (const tool of registry().list()) {
    assert.ok(tool.annotations, tool.name);
    if (!tool.annotations.readOnlyHint) assert.equal(typeof tool.annotations.destructiveHint, 'boolean', tool.name);
  }
});

test('changes are snapshotted, logged and can be restored (and the restore undone)', async () => {
  const store = createTestStore();
  const tools = registry();
  await call(tools, 'upsert_account', { institution: 'Banco Exemplo', type: 'checking', nickname: 'Conta exemplo' });
  await call(tools, 'upsert_goal', { name: 'Reserva de emergência', target: 30000, deadline: '2027-12-31' });
  const history = (await call(tools, 'list_changes')).data.changes;
  assert.deepEqual(history.slice(0, 2).map((entry) => entry.operation), ['upsert_goal', 'upsert_account']);
  assert.deepEqual(history[0].changed, ['goals']);

  const backups = (await call(tools, 'list_backups')).data.backups.filter((backup) => backup.kind === 'operation');
  const beforeGoal = backups.find((backup) => backup.beforeOperation === 'upsert_goal');
  assert.ok(beforeGoal);

  const ask = await call(tools, 'restore_backup', { backup_id: beforeGoal.id });
  assert.equal(ask.data.status, 'confirmation_required');
  assert.equal(store.data.goals.length, 1, 'nothing changes before confirmation');
  const done = await call(tools, 'restore_backup', { backup_id: beforeGoal.id, confirmation_token: ask.data.confirmation_token });
  assert.equal(done.data.restored, true);
  assert.equal(store.data.goals.length, 0);
  assert.equal(store.data.accounts.length, 1);

  const undo = (await call(tools, 'list_backups')).data.backups.find((backup) => backup.beforeOperation === 'restore_backup');
  const askUndo = await call(tools, 'restore_backup', { backup_id: undo.id });
  await call(tools, 'restore_backup', { backup_id: undo.id, confirmation_token: askUndo.data.confirmation_token });
  assert.equal(store.data.goals.length, 1);
});

test('a token issued for other arguments does not authorize the call', async () => {
  createTestStore();
  const tools = registry();
  await call(tools, 'upsert_account', { institution: 'Banco Exemplo', type: 'checking', nickname: 'Conta exemplo' });
  const ids = (await call(tools, 'list_backups')).data.backups.filter((backup) => backup.kind === 'operation').map((backup) => backup.id);
  const ask = await call(tools, 'restore_backup', { backup_id: ids[0] });
  const misuse = await call(tools, 'restore_backup', { backup_id: ids.at(-1), confirmation_token: ask.data.confirmation_token });
  assert.equal(misuse.data.status, 'confirmation_required');
  assert.equal(misuse.data.tokenRejected, true);
});

test('reads without changes do not create snapshots', async () => {
  const store = createTestStore();
  const before = readdirSync(store.layout.operationBackups).length;
  await call(registry(), 'get_status');
  await call(registry(), 'list_accounts');
  assert.equal(readdirSync(store.layout.operationBackups).length, before);
});

test('forced registration needs the user to confirm', async () => {
  const store = createTestStore();
  const account = addAccount(store, { institution: 'Banco Exemplo', type: 'checking', nickname: 'Conta exemplo' });
  const tools = registry();
  const args = {
    account_id: account.id,
    file_name: 'extrato-exemplo.pdf',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 1000, closing_balance: 2000 },
    transactions: [{ date: '2026-10-02', description: 'Pix recebido - Cliente Exemplo', amount: 999.9 }],
    force: true,
  };
  const ask = await call(tools, 'register_bank_statement', args);
  assert.equal(ask.data.status, 'confirmation_required');
  assert.match(ask.data.summary, /mesmo sem fechar com os totais/);
  assert.equal(store.data.transactions.length, 0);
  const done = await call(tools, 'register_bank_statement', { ...args, confirmation_token: ask.data.confirmation_token });
  assert.equal(done.data.status, 'registered_with_differences');
  assert.equal(store.data.transactions.length, 1);
});

test('assistant suggestions never replace a category chosen by the user', async () => {
  const store = createTestStore();
  const account = addAccount(store, { institution: 'Banco Exemplo', type: 'checking', nickname: 'Conta exemplo' });
  const tools = registry();
  await call(tools, 'register_bank_statement', {
    account_id: account.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 1000, closing_balance: 850 },
    transactions: [{ date: '2026-10-03', description: 'Compra Mercado Exemplo', payee: 'Mercado Exemplo', amount: -150 }],
  });
  const tx = store.data.transactions[0];
  const [food, leisure] = store.data.categories.filter((category) => category.kind === 'expense');
  await call(tools, 'categorize_transactions', { items: [{ transaction_id: tx.id, category_id: food.id }], source: 'user' });
  const suggestion = await call(tools, 'categorize_transactions', { items: [{ transaction_id: tx.id, category_id: leisure.id }], source: 'assistant' });
  assert.deepEqual(suggestion.data.skippedManual, [tx.id]);
  assert.equal(store.data.transactions[0].categoryId, food.id);
});

test('large categorizations ask first', async () => {
  const store = createTestStore();
  const account = addAccount(store, { institution: 'Banco Exemplo', type: 'checking', nickname: 'Conta exemplo' });
  const tools = registry();
  const transactions = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-10-${String((index % 28) + 1).padStart(2, '0')}`,
    description: `Compra Loja Exemplo ${index}`,
    payee: `Loja Exemplo ${index}`,
    amount: -10,
  }));
  await call(tools, 'register_bank_statement', {
    account_id: account.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 1000, closing_balance: 700 },
    transactions,
  });
  const category = store.data.categories.find((item) => item.kind === 'expense');
  const items = store.data.transactions.map((tx) => ({ transaction_id: tx.id, category_id: category.id }));
  const ask = await call(tools, 'categorize_transactions', { items });
  assert.equal(ask.data.status, 'confirmation_required');
  assert.ok(store.data.transactions.every((tx) => !tx.categoryId || tx.categorySource === 'rule'));
  const done = await call(tools, 'categorize_transactions', { items, confirmation_token: ask.data.confirmation_token });
  assert.equal(done.data.updated, 30);
});

test('changing the data folder asks first and never moves or deletes the current data', async () => {
  const store = createTestStore();
  const tools = registry();
  const same = await call(tools, 'setup_workspace', { data_dir: store.layout.root });
  assert.equal(same.data.dataDir, store.layout.root);
  const other = join(mkdtempSync(join(tmpdir(), 'agente-financeiro-outra-')), 'dados');
  const ask = await call(tools, 'setup_workspace', { data_dir: other });
  assert.equal(ask.data.status, 'confirmation_required');
  assert.equal(existsSync(other), false);
  await call(tools, 'setup_workspace', { data_dir: other, confirmation_token: ask.data.confirmation_token });
  assert.equal(existsSync(join(other, 'dados')), true);
  assert.equal(existsSync(store.layout.dataFile), true);
});

test('spreadsheets are never overwritten', () => {
  const store = createTestStore();
  const first = exportReports(store, { toMonth: '2026-10', months: 3 });
  const second = exportReports(store, { toMonth: '2026-10', months: 3 });
  assert.notEqual(first.file, second.file);
  assert.match(second.file, /agente-financeiro-2026-10-2\.xlsx$/);
});
