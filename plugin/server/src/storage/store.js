import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { today } from '../lib/dates.js';

export const SCHEMA_VERSION = 1;
const DATA_FILE = 'agente-financeiro.json';
const BACKUPS_TO_KEEP = 30;

/** Collections persisted in the data file and their empty values. */
const EMPTY_DATA = Object.freeze({
  accounts: [],
  categories: [],
  categoryRules: [],
  goals: [],
  profile: null,
  documents: [],
  transactions: [],
  assets: [],
  positions: [],
  pending: [],
  market: { indicators: {}, quotes: {}, updatedAt: null },
  analyses: [],
  decisions: [],
});

/**
 * Folder layout inside the user's data directory.
 * @param {string} dataDir
 */
export function dataLayout(dataDir) {
  return {
    root: dataDir,
    dataFolder: join(dataDir, 'dados'),
    dataFile: join(dataDir, 'dados', DATA_FILE),
    backups: join(dataDir, 'dados', 'backups'),
    spreadsheets: join(dataDir, 'planilhas'),
  };
}

/**
 * JSON file store. The whole dataset lives in a single file that is rewritten
 * atomically (temporary file + rename) on every change. A daily snapshot is
 * kept in `dados/backups`. Designed for a single user and a single process.
 */
export class Store {
  /**
   * @param {string} dataDir
   */
  constructor(dataDir) {
    this.layout = dataLayout(dataDir);
    /** @type {any} */
    this.data = null;
  }

  /** Creates the folder structure when missing and loads the data file. */
  open() {
    mkdirSync(this.layout.dataFolder, { recursive: true });
    mkdirSync(this.layout.backups, { recursive: true });
    mkdirSync(this.layout.spreadsheets, { recursive: true });
    if (existsSync(this.layout.dataFile)) {
      const parsed = JSON.parse(readFileSync(this.layout.dataFile, 'utf8'));
      this.data = migrate(parsed);
    } else {
      this.data = { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), ...structuredClone(EMPTY_DATA) };
      this.persist();
    }
    return this;
  }

  /**
   * Read-only access to a collection.
   * @param {keyof typeof EMPTY_DATA} name
   */
  get(name) {
    return this.data[name];
  }

  /**
   * Runs a mutation and persists the result. If the mutation throws, the
   * in-memory state is restored and nothing is written.
   * @template T
   * @param {(data: any) => T} mutation
   * @returns {T}
   */
  transact(mutation) {
    const snapshot = structuredClone(this.data);
    try {
      const result = mutation(this.data);
      this.data.updatedAt = new Date().toISOString();
      this.persist();
      return result;
    } catch (error) {
      this.data = snapshot;
      throw error;
    }
  }

  persist() {
    this.backupOncePerDay();
    const temp = `${this.layout.dataFile}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data));
    renameSync(temp, this.layout.dataFile);
  }

  backupOncePerDay() {
    if (!existsSync(this.layout.dataFile)) return;
    const target = join(this.layout.backups, `agente-financeiro-${today()}.json`);
    if (existsSync(target)) return;
    writeFileSync(target, readFileSync(this.layout.dataFile));
    const backups = readdirSync(this.layout.backups)
      .filter((name) => name.startsWith('agente-financeiro-') && name.endsWith('.json'))
      .sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - BACKUPS_TO_KEEP))) {
      rmSync(join(this.layout.backups, old), { force: true });
    }
  }
}

function migrate(parsed) {
  const data = { ...structuredClone(EMPTY_DATA), ...parsed };
  if (!data.schemaVersion || data.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Unsupported data file version: ${data.schemaVersion}`);
  }
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}
