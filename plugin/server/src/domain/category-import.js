import { newId } from '../lib/text.js';
import { parseTaxId } from '../lib/tax-id.js';
import { UserError } from '../lib/errors.js';
import { findCategory, matchRule, upsertRule } from './categories.js';

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Adds the categories from a list sent by the user. Existing names are kept (and
 * reactivated when inactive); nothing is renamed or removed.
 * @param {any} data
 * @param {Array<{ kind: 'income'|'expense', group: string, name: string }>} items
 */
export function importCategories(data, items) {
  const created = [];
  const reactivated = [];
  const existing = [];
  for (const item of items) {
    const found = data.categories.find((category) => sameName(category.name, item.name));
    if (found) {
      if (found.kind !== item.kind) throw new UserError(`"${found.name}" já existe como ${found.kind === 'income' ? 'receita' : 'despesa'}.`);
      if (found.active === false) {
        found.active = true;
        reactivated.push(found.name);
      } else existing.push(found.name);
      continue;
    }
    const category = { id: newId('cat'), name: item.name.trim(), group: item.group.trim(), kind: item.kind, active: true, system: false };
    data.categories.push(category);
    created.push(category.name);
  }
  return { created, reactivated, existing };
}

/**
 * Learns identification examples sent by the user ("Pix para a CNPJ X é alimentação").
 * They become manual rules, by CPF/CNPJ when one is given, otherwise by name.
 * @param {any} data
 * @param {Array<{ payee?: string, tax_id?: string, category: string }>} examples
 */
export function learnExamples(data, examples) {
  const learned = [];
  for (const example of examples) {
    const category = findCategory(data.categories, example.category);
    if (!category) throw new UserError(`Categoria não encontrada: ${example.category}`);
    const taxId = example.tax_id ? parseTaxId(example.tax_id) : null;
    if (example.tax_id && !taxId) throw new UserError(`CPF ou CNPJ inválido: ${example.tax_id}`);
    if (!taxId && !example.payee) throw new UserError('Cada exemplo precisa de payee ou tax_id.');
    const rule = upsertRule(data.categoryRules, example.payee ?? '', category.id, 'manual', taxId);
    if (rule) learned.push({ payee: example.payee ?? null, category: category.name, byTaxId: Boolean(taxId) });
  }
  return learned;
}

/**
 * Applies the learned rules to confirmed income/expense lines that still have no category.
 * Never touches a line that already has a category.
 * @param {any} data
 */
export function applyRulesToUncategorized(data) {
  let applied = 0;
  for (const tx of data.transactions) {
    if (tx.status !== 'confirmed' || tx.categoryId || (tx.nature !== 'income' && tx.nature !== 'expense')) continue;
    const rule = matchRule(data.categoryRules, tx.payee || tx.description, tx.counterpartyTaxId);
    if (!rule) continue;
    tx.categoryId = rule.categoryId;
    tx.categorySource = 'rule';
    rule.hits = (rule.hits ?? 0) + 1;
    applied += 1;
  }
  return applied;
}
