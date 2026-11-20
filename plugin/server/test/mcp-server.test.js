import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '../src/mcp/server.js';
import { ToolRegistry } from '../src/mcp/registry.js';
import { allTools } from '../src/tools/index.js';
import { createTestStore } from './helpers.js';

function server() {
  return new McpServer({ name: 'agente-financeiro', version: 'test' }, new ToolRegistry().register(allTools()));
}

async function call(srv, name, args) {
  const response = await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return response.result;
}

test('initialize negotiates the protocol version', async () => {
  const response = await server().handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(response.result.protocolVersion, '2025-03-26');
  assert.deepEqual(response.result.capabilities, { tools: { listChanged: false } });
});

test('notifications get no response and unknown methods return an error', async () => {
  const srv = server();
  assert.equal(await srv.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  const unknown = await srv.handle({ jsonrpc: '2.0', id: 7, method: 'resources/list' });
  assert.equal(unknown.error.code, -32601);
});

test('every tool has a description and an object schema', async () => {
  const response = await server().handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  for (const tool of response.result.tools) {
    assert.ok(tool.description.length > 20, tool.name);
    assert.equal(tool.inputSchema.type, 'object', tool.name);
  }
});

test('invalid arguments are reported back as a tool error', async () => {
  createTestStore();
  const result = await call(server(), 'upsert_account', { type: 'banana' });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /input\.type/);
});

test('end to end: account, statement, categorization and summary in reais', async () => {
  createTestStore();
  const srv = server();
  const account = (await call(srv, 'upsert_account', { institution: 'Santander', type: 'checking', nickname: 'Santander' })).structuredContent.account;
  const registered = await call(srv, 'register_bank_statement', {
    account_id: account.id,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    totals: { opening_balance: 'R$ 100,00', closing_balance: 'R$ 78,40' },
    transactions: [{ date: '2026-10-03', description: 'Pix enviado Metro Exemplo', payee: 'Metro Exemplo', amount: '-R$ 21,60' }],
  });
  assert.equal(registered.structuredContent.status, 'registered');
  const pending = registered.structuredContent.uncategorized;
  assert.equal(pending[0].amount, -21.6);

  const categories = (await call(srv, 'list_categories', {})).structuredContent.groups;
  const transport = categories['Despesa > Transporte'].find((category) => category.name === 'Aplicativos de transporte');
  const categorized = await call(srv, 'categorize_transactions', { items: [{ transaction_id: pending[0].id, category_id: transport.id }] });
  assert.deepEqual(categorized.structuredContent.rulesLearned, ['METRO EXEMPLO']);

  const summary = (await call(srv, 'get_month_summary', { month: '2026-10' })).structuredContent;
  assert.equal(summary.cash.expense, -21.6);
  assert.equal(summary.uncategorizedCount, 0);
});
