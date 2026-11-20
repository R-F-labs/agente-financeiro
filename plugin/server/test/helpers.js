import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupWorkspace, requireStore, useStoreForTesting } from '../src/storage/workspace.js';

/**
 * Creates an isolated workspace in a temporary folder and returns its store.
 * The plugin settings also go to a temporary folder, never to the real home.
 */
export function createTestStore() {
  const root = mkdtempSync(join(tmpdir(), 'agente-financeiro-test-'));
  process.env.AGENTE_FINANCEIRO_CONFIG_DIR = join(root, 'config');
  delete process.env.AGENTE_FINANCEIRO_DATA_DIR;
  useStoreForTesting(null);
  setupWorkspace(join(root, 'dados-usuario'));
  return requireStore();
}

/**
 * @param {import('../src/storage/store.js').Store} store
 * @param {Record<string, unknown>} fields
 */
export function addAccount(store, fields) {
  return store.transact((data) => {
    const account = { id: `acc_${fields.nickname.toLowerCase().replace(/\W+/g, '')}`, active: true, cardLast4s: [], expectsMonthlyDocument: true, ...fields };
    data.accounts.push(account);
    return account;
  });
}
