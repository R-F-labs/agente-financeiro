import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_FILE = 'config.json';

/**
 * Directory where the plugin keeps its own settings (not the financial data).
 * Priority: AGENTE_FINANCEIRO_CONFIG_DIR, CLAUDE_PLUGIN_DATA (set by Claude for plugins),
 * then ~/.agente-financeiro.
 * @returns {string}
 */
export function configDirectory() {
  return (
    process.env.AGENTE_FINANCEIRO_CONFIG_DIR ||
    process.env.CLAUDE_PLUGIN_DATA ||
    join(homedir(), '.agente-financeiro')
  );
}

/**
 * Suggested default location for the financial data.
 * @returns {string}
 */
export function defaultDataDirectory() {
  return join(homedir(), 'Documents', 'Agente Financeiro');
}

/**
 * @returns {{ dataDir?: string, configuredAt?: string }}
 */
export function readConfig() {
  const envDataDir = process.env.AGENTE_FINANCEIRO_DATA_DIR;
  const file = join(configDirectory(), CONFIG_FILE);
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      config = {};
    }
  }
  if (envDataDir && envDataDir.trim() !== '') config.dataDir = envDataDir;
  return config;
}

/**
 * @param {{ dataDir: string }} config
 */
export function writeConfig(config) {
  const dir = configDirectory();
  mkdirSync(dir, { recursive: true });
  const file = join(dir, CONFIG_FILE);
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ ...config, configuredAt: new Date().toISOString() }, null, 2)}\n`);
  renameSync(temp, file);
}
