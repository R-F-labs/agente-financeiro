import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/**
 * Runs a tool handler with its name available to the storage layer, which uses it to
 * label the operation snapshot and the change history.
 * @template T
 * @param {string} operation
 * @param {() => T} callback
 * @returns {T}
 */
export function runOperation(operation, callback) {
  return storage.run({ operation }, callback);
}

/** Name of the tool being executed, or "interno" outside a tool call. */
export function currentOperation() {
  return storage.getStore()?.operation ?? 'interno';
}
