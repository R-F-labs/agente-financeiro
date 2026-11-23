import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { today } from '../lib/dates.js';
import { currentOperation } from '../guardrails/operation-context.js';

export const SCHEMA_VERSION = 1;
const DATA_FILE = 'agente-financeiro.json';
const BACKUPS_TO_KEEP = 30;
const OPERATION_SNAPSHOTS_TO_KEEP = 50;
const DAILY_BACKUP = /^agente-financeiro-(\d{4}-\d{2}-\d{2})\.json$/;
const OPERATION_BACKUP = /^(\d{8}T\d{9})-([a-z_]+)\.json$/;

/** Collections persisted in the data file and their empty values. */
const EMPTY_DATA = Object.freeze({
  accounts: [],
  categories: [],
  categoryRules: [],
  counterparties: [],
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
    operationBackups: join(dataDir, 'dados', 'backups', 'operacoes'),
    history: join(dataDir, 'dados', 'historico.jsonl'),
    spreadsheets: join(dataDir, 'planilhas'),
    inbox: join(dataDir, 'entrada'),
  };
}

/**
 * JSON file store. The whole dataset lives in a single file that is rewritten
 * atomically (temporary file + rename) on every change. Safety nets:
 * - before every change, the previous state is saved in `dados/backups/operacoes`
 *   (last 50 operations), labelled with the tool that made the change;
 * - a daily snapshot is kept in `dados/backups` (last 30 days);
 * - every change is appended to `dados/historico.jsonl`.
 * Nothing in the store deletes records: tools deactivate or mark them instead.
 * Designed for a single user and a single process.
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
    mkdirSync(this.layout.operationBackups, { recursive: true });
    mkdirSync(this.layout.spreadsheets, { recursive: true });
    mkdirSync(this.layout.inbox, { recursive: true });
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
    let result;
    try {
      result = mutation(this.data);
    } catch (error) {
      this.data = snapshot;
      throw error;
    }
    const changed = changedCollections(snapshot, this.data);
    if (changed.length === 0) return result;
    const operation = currentOperation();
    this.data.updatedAt = new Date().toISOString();
    try {
      this.saveOperationSnapshot(snapshot, operation);
      this.persist();
    } catch (error) {
      this.data = snapshot;
      throw error;
    }
    this.appendHistory({ at: this.data.updatedAt, operation, changed });
    return result;
  }

  /**
   * Replaces the whole dataset with a backup. The current state is saved first, so a
   * restore can itself be undone.
   * @param {string} backupId File name returned by listBackups.
   */
  restore(backupId) {
    const file = this.backupFile(backupId);
    const restored = migrate(JSON.parse(readFileSync(file, 'utf8')));
    return this.transact((data) => {
      for (const key of Object.keys(data)) delete data[key];
      Object.assign(data, restored);
      return { restored: backupId };
    });
  }

  /** Available backups, newest first. */
  listBackups() {
    const backups = [];
    for (const name of safeList(this.layout.operationBackups)) {
      const match = OPERATION_BACKUP.exec(name);
      if (!match) continue;
      backups.push({ id: name, kind: 'operation', takenAt: fromCompactTimestamp(match[1]), beforeOperation: match[2], sizeBytes: sizeOf(join(this.layout.operationBackups, name)) });
    }
    for (const name of safeList(this.layout.backups)) {
      const match = DAILY_BACKUP.exec(name);
      if (!match) continue;
      backups.push({ id: name, kind: 'daily', takenAt: `${match[1]}T00:00:00`, sizeBytes: sizeOf(join(this.layout.backups, name)) });
    }
    return backups.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  /**
   * Last entries of the change history, newest first.
   * @param {number} limit
   */
  readHistory(limit) {
    if (!existsSync(this.layout.history)) return [];
    const lines = readFileSync(this.layout.history, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).reverse().map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  }

  /** @param {string} backupId */
  backupFile(backupId) {
    if (OPERATION_BACKUP.test(backupId)) return join(this.layout.operationBackups, backupId);
    if (DAILY_BACKUP.test(backupId)) return join(this.layout.backups, backupId);
    throw new Error(`Unknown backup: ${backupId}`);
  }

  saveOperationSnapshot(snapshot, operation) {
    if (!existsSync(this.layout.dataFile)) return;
    const name = `${compactTimestamp(new Date())}-${operation.replace(/[^a-z_]/g, '') || 'interno'}.json`;
    writeFileSync(join(this.layout.operationBackups, name), JSON.stringify(snapshot));
    const snapshots = safeList(this.layout.operationBackups).filter((file) => OPERATION_BACKUP.test(file)).sort();
    for (const old of snapshots.slice(0, Math.max(0, snapshots.length - OPERATION_SNAPSHOTS_TO_KEEP))) {
      rmSync(join(this.layout.operationBackups, old), { force: true });
    }
  }

  appendHistory(entry) {
    try {
      appendFileSync(this.layout.history, `${JSON.stringify(entry)}\n`);
    } catch {
      // The history is informative; failing to append must not undo a saved change.
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

function changedCollections(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('updatedAt');
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
}

function compactTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${iso.slice(20, 23)}`;
}

function fromCompactTimestamp(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}.${value.slice(15, 18)}Z`;
}

function safeList(folder) {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

function sizeOf(file) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
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
