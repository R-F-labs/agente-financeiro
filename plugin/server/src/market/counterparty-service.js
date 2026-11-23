import { fetchCompany } from './brasilapi.js';
import { rememberCounterparty, suggestCategoryFor } from '../domain/counterparties.js';
import { formatTaxId, parseTaxId } from '../lib/tax-id.js';
import { UserError } from '../lib/errors.js';

const STALE_DAYS = 180;

/**
 * Resolves the CPF/CNPJ to look up: typed by the assistant or taken from a transaction.
 * @param {any} data
 * @param {{ tax_id?: string, transaction_id?: string }} input
 */
function resolveTaxId(data, input) {
  if (input.tax_id) {
    const parsed = parseTaxId(input.tax_id);
    if (!parsed) throw new UserError('CPF ou CNPJ inválido.');
    return parsed;
  }
  const tx = data.transactions.find((item) => item.id === input.transaction_id);
  if (!tx) throw new UserError(`Lançamento não encontrado: ${input.transaction_id}`);
  if (!tx.counterpartyTaxId) throw new UserError('Este lançamento não traz CPF nem CNPJ na descrição.');
  return tx.counterpartyTaxId;
}

const isFresh = (record) =>
  record?.checkedAt && Date.now() - Date.parse(record.checkedAt) < STALE_DAYS * 86_400_000;

function answer(data, record, cached) {
  return {
    taxId: formatTaxId({ kind: 'cnpj', digits: record.taxId }),
    found: true,
    cached,
    name: record.name,
    tradeName: record.tradeName,
    activity: record.activity,
    status: record.status,
    suggestion: suggestCategoryFor(data.categories, record),
    next: 'Confirme a categoria com o usuário quando não tiver segurança e registre com categorize_transactions (remember: true): a regra fica ligada ao CNPJ.',
  };
}

/**
 * Looks up a company in the public registry and keeps it in the local memory, so the
 * same counterparty is recognized in the next statements without a new lookup.
 * CPFs (people) are never looked up: the counterparty is learned from the user.
 * @param {import('../storage/store.js').Store} store
 * @param {{ tax_id?: string, transaction_id?: string, refresh?: boolean }} input
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function lookupCounterparty(store, input, options = {}) {
  if (!input.tax_id && !input.transaction_id) throw new UserError('Informe tax_id ou transaction_id.');
  const taxId = resolveTaxId(store.data, input);
  if (taxId.kind === 'cpf') {
    return {
      taxId: formatTaxId(taxId),
      found: false,
      kind: 'cpf',
      message: 'É um CPF (pessoa física): não é consultado em nenhum serviço. Pergunte ao usuário quem é e registre a categoria com remember: true.',
    };
  }
  const cached = (store.data.counterparties ?? []).find((item) => item.taxId === taxId.digits);
  if (cached && isFresh(cached) && !input.refresh) return answer(store.data, cached, true);
  const company = await fetchCompany(options.fetchImpl ?? globalThis.fetch, taxId.digits);
  if (!company) return { taxId: formatTaxId(taxId), found: false, kind: 'cnpj', message: 'CNPJ não encontrado na base pública.' };
  const record = store.transact((data) => rememberCounterparty(data, company));
  return answer(store.data, record, false);
}
