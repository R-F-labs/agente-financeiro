import { existsSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readConfig, writeConfig, defaultDataDirectory } from './config.js';
import { Store } from './store.js';
import { UserError } from '../lib/errors.js';
import { seedCategories } from '../domain/categories.js';

/** @type {Store | null} */
let current = null;

/**
 * Returns the open store or throws a guidance error when the workspace was never configured.
 * @returns {Store}
 */
export function requireStore() {
  if (current) return current;
  const { dataDir } = readConfig();
  if (!dataDir) {
    throw new UserError(
      'O Agente Financeiro ainda não foi configurado. Pergunte ao usuário em qual pasta os dados devem ficar e chame setup_workspace.',
      { suggestedDataDir: defaultDataDirectory() },
    );
  }
  current = new Store(dataDir).open();
  return current;
}

/**
 * @returns {{ configured: boolean, dataDir?: string, suggestedDataDir: string }}
 */
export function workspaceStatus() {
  const { dataDir } = readConfig();
  return { configured: Boolean(dataDir), dataDir, suggestedDataDir: defaultDataDirectory() };
}

/**
 * Configures (or moves the pointer to) the data folder, creates its structure and
 * seeds default categories on first use.
 * @param {string} rawPath
 */
export function setupWorkspace(rawPath) {
  const dataDir = expandPath(rawPath);
  current = new Store(dataDir).open();
  writeConfig({ dataDir });
  const store = current;
  if (store.get('categories').length === 0) {
    store.transact((data) => {
      data.categories.push(...seedCategories());
    });
  }
  const readme = join(dataDir, 'LEIA-ME.txt');
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        'Agente Financeiro',
        '',
        'Esta pasta guarda os seus dados financeiros. Nada aqui é enviado para servidores.',
        '',
        'entrada/                      Coloque aqui extratos e faturas (PDF, ZIP, CSV), inclusive os protegidos por senha.',
        'dados/agente-financeiro.json  Base de dados (não edite manualmente).',
        'dados/historico.jsonl         Registro de cada alteração feita pelo agente.',
        'dados/backups/                Cópias diárias automáticas dos últimos 30 dias.',
        'dados/backups/operacoes/      Cópia do estado anterior a cada alteração (últimas 50).',
        'planilhas/                    Planilhas geradas a pedido, para abrir no Excel ou no celular.',
        '',
        'Senhas de documentos não são guardadas, e nenhuma cópia desprotegida é gravada.',
        '',
        'Dica: deixe esta pasta dentro do Google Drive, OneDrive ou iCloud para ter cópia na nuvem',
        'e acessar as planilhas pelo celular.',
        '',
      ].join('\n'),
    );
  }
  return { dataDir, layout: store.layout };
}

/**
 * Describes a change of data folder that needs the user's agreement, or null when the
 * call only configures the first folder or repeats the current one.
 * @param {string} rawPath
 */
export function workspaceChange(rawPath) {
  const { dataDir } = readConfig();
  if (!dataDir) return null;
  const target = expandPath(rawPath);
  if (resolve(dataDir) === target) return null;
  return { from: dataDir, to: target };
}

/** Used by tests to inject an isolated store. */
export function useStoreForTesting(store) {
  current = store;
}

function expandPath(rawPath) {
  const trimmed = String(rawPath ?? '').trim();
  if (trimmed === '') throw new UserError('Informe o caminho da pasta de dados.');
  const expanded = trimmed.startsWith('~') ? join(homedir(), trimmed.slice(1)) : trimmed;
  if (!isAbsolute(expanded)) throw new UserError('Use um caminho completo para a pasta de dados.', { path: rawPath });
  return resolve(expanded);
}
