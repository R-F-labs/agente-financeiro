import { date, month, object } from './schemas.js';
import { formatTaxId } from '../lib/tax-id.js';
import { requireStore } from '../storage/workspace.js';
import { upsertRule } from '../domain/categories.js';
import { cancelRemainingForecasts } from '../domain/installments.js';
import { UserError } from '../lib/errors.js';
import { monthOf } from '../lib/dates.js';

const NATURES = ['income', 'expense', 'transfer', 'investment_contribution', 'investment_withdrawal', 'card_payment'];

/** From this many changed transactions, a categorization needs the user's agreement. */
export const BULK_CATEGORIZATION_LIMIT = 25;

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
/**
 * Same counterparty: same CPF/CNPJ when both lines carry one, otherwise the same payee key.
 * @param {any} a
 * @param {any} b
 */
function sameCounterparty(a, b) {
  if (a.counterpartyTaxId && b.counterpartyTaxId) return a.counterpartyTaxId.digits === b.counterpartyTaxId.digits;
  return a.payeeKey === b.payeeKey;
}

export const transactionTools = [
  {
    name: 'list_transactions',
    title: 'Consultar lançamentos',
    description: 'Lista lançamentos com filtros (mês, conta, categoria, texto, sem categoria, previstos). Valores em reais; despesas negativas.',
    inputSchema: object({
      month,
      account_id: { type: 'string' },
      category_id: { type: 'string' },
      search: { type: 'string', description: 'Texto no beneficiário ou descrição.' },
      uncategorized_only: { type: 'boolean' },
      status: { type: 'string', enum: ['confirmed', 'forecast', 'cancelled'] },
      limit: { type: 'integer', minimum: 1, maximum: 500 },
    }),
    annotations: { readOnlyHint: true },
    handler: (filters) => {
      const store = requireStore();
      const names = new Map(store.get('categories').map((category) => [category.id, category.name]));
      const term = filters.search?.toUpperCase();
      const status = filters.status ?? 'confirmed';
      const rows = store
        .get('transactions')
        .filter((tx) => tx.status === status)
        .filter((tx) => !filters.month || monthOf(tx.date) === filters.month)
        .filter((tx) => !filters.account_id || tx.accountId === filters.account_id)
        .filter((tx) => !filters.category_id || tx.categoryId === filters.category_id)
        .filter((tx) => !filters.uncategorized_only || (!tx.categoryId && (tx.nature === 'income' || tx.nature === 'expense')))
        .filter((tx) => !term || `${tx.payee ?? ''} ${tx.description}`.toUpperCase().includes(term))
        .sort((a, b) => b.date.localeCompare(a.date));
      const limit = filters.limit ?? 100;
      return {
        total: rows.length,
        sumCents: rows.reduce((acc, tx) => acc + tx.amountCents, 0),
        transactions: rows.slice(0, limit).map((tx) => ({
          id: tx.id,
          date: tx.date,
          cashDate: tx.cashDate,
          accountId: tx.accountId,
          payee: tx.payee,
          counterparty: formatTaxId(tx.counterpartyTaxId),
          description: tx.description,
          amountCents: tx.amountCents,
          category: names.get(tx.categoryId) ?? null,
          nature: tx.nature,
          installment: tx.installment ? `${tx.installment.number}/${tx.installment.total}` : null,
          notes: tx.notes,
        })),
        truncated: rows.length > limit,
      };
    },
  },
  {
    name: 'categorize_transactions',
    title: 'Categorizar lançamentos',
    description:
      'Aplica categorias a lançamentos. Com remember: true (padrão), o beneficiário vira regra e os próximos lançamentos dele são categorizados sozinhos. Use source "user" quando o usuário escolheu e "assistant" quando foi sugestão sua aceita sem revisão.',
    inputSchema: object(
      {
        items: {
          type: 'array',
          minItems: 1,
          items: object(
            {
              transaction_id: { type: 'string' },
              category_id: { type: 'string' },
              remember: { type: 'boolean' },
              apply_to_similar: { type: 'boolean', description: 'Aplica também aos lançamentos sem categoria do mesmo beneficiário.' },
            },
            ['transaction_id', 'category_id'],
          ),
        },
        source: { type: 'string', enum: ['user', 'assistant'] },
      },
      ['items'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    confirm: confirmBulkCategorization,
    handler: ({ items, source = 'user' }) =>
      requireStore().transact((data) => {
        const categories = new Map(data.categories.map((category) => [category.id, category]));
        let updated = 0;
        const rules = [];
        const skippedManual = [];
        for (const item of items) {
          const tx = data.transactions.find((candidate) => candidate.id === item.transaction_id);
          if (!tx) throw new UserError(`Lançamento não encontrado: ${item.transaction_id}`);
          if (!categories.has(item.category_id)) throw new UserError(`Categoria não encontrada: ${item.category_id}`);
          const origin = source === 'user' ? 'manual' : 'assistant';
          if (origin === 'assistant' && tx.categorySource === 'manual' && tx.categoryId && tx.categoryId !== item.category_id) {
            // Guardrail: a suggestion never replaces a category the user chose.
            skippedManual.push(tx.id);
            continue;
          }
          tx.categoryId = item.category_id;
          tx.categorySource = origin;
          updated += 1;
          if (item.remember !== false) {
            const rule = upsertRule(data.categoryRules, tx.payee || tx.description, item.category_id, origin, tx.counterpartyTaxId);
            if (rule) rules.push(rule.pattern);
          }
          if (item.apply_to_similar) {
            for (const other of data.transactions) {
              if (other.id !== tx.id && !other.categoryId && sameCounterparty(other, tx) && (other.nature === 'income' || other.nature === 'expense')) {
                other.categoryId = item.category_id;
                other.categorySource = origin;
                updated += 1;
              }
            }
          }
        }
        return {
          updated,
          rulesLearned: [...new Set(rules)],
          skippedManual,
          note: skippedManual.length > 0 ? 'Lançamentos com categoria escolhida pelo usuário não foram alterados. Para mudar, confirme com ele e use source "user".' : undefined,
        };
      }),
  },
  {
    name: 'update_transaction',
    title: 'Ajustar lançamento',
    description:
      'Ajusta um lançamento: data de competência, natureza (ex.: marcar como transferência entre contas próprias), ligação com outro lançamento, observação, ou cancelar as parcelas futuras de uma compra (antecipação, estorno ou quitação).',
    inputSchema: object(
      {
        transaction_id: { type: 'string' },
        competence_date: date,
        nature: { type: 'string', enum: NATURES },
        linked_transaction_id: { type: 'string' },
        notes: { type: 'string' },
        cancel_remaining_installments: { type: 'boolean' },
      },
      ['transaction_id'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    confirm: confirmTransactionChange,
    handler: (input) =>
      requireStore().transact((data) => {
        const tx = data.transactions.find((candidate) => candidate.id === input.transaction_id);
        if (!tx) throw new UserError(`Lançamento não encontrado: ${input.transaction_id}`);
        if (input.competence_date) tx.date = input.competence_date;
        if (input.nature) {
          tx.nature = input.nature;
          tx.provisional = false;
          if (!['income', 'expense'].includes(input.nature)) tx.categoryId = null;
        }
        if (input.linked_transaction_id) {
          const other = data.transactions.find((candidate) => candidate.id === input.linked_transaction_id);
          if (!other) throw new UserError(`Lançamento não encontrado: ${input.linked_transaction_id}`);
          tx.linkedTransactionId = other.id;
          other.linkedTransactionId = tx.id;
          other.nature = tx.nature;
          other.categoryId = tx.categoryId;
        }
        if (input.notes !== undefined) tx.notes = input.notes;
        let cancelled = 0;
        if (input.cancel_remaining_installments) {
          if (!tx.installment) throw new UserError('Este lançamento não é parcelado.');
          cancelled = cancelRemainingForecasts(data.transactions, tx.installment.groupId);
        }
        return { saved: true, cancelledForecasts: cancelled };
      }),
  },
];

function confirmBulkCategorization({ items, source = 'user' }) {
  const data = requireStore().data;
  const byId = new Map(data.transactions.map((tx) => [tx.id, tx]));
  const seen = new Set();
  let replacedManual = 0;
  for (const item of items) {
    const tx = byId.get(item.transaction_id);
    if (!tx) continue;
    seen.add(tx.id);
    if (source === 'user' && tx.categorySource === 'manual' && tx.categoryId && tx.categoryId !== item.category_id) replacedManual += 1;
    if (item.apply_to_similar) {
      for (const other of data.transactions) {
        if (other.id !== tx.id && !other.categoryId && other.payeeKey === tx.payeeKey) seen.add(other.id);
      }
    }
  }
  if (seen.size < BULK_CATEGORIZATION_LIMIT && replacedManual < 5) return null;
  return {
    summary: `Categorizar ${seen.size} lançamentos de uma vez${replacedManual > 0 ? `, trocando ${replacedManual} categorias escolhidas antes pelo usuário` : ''}.`,
    details: { transactions: seen.size, replacedManualCategories: replacedManual },
  };
}

function confirmTransactionChange(input) {
  if (!input.cancel_remaining_installments) return null;
  const data = requireStore().data;
  const tx = data.transactions.find((candidate) => candidate.id === input.transaction_id);
  if (!tx?.installment) return null;
  const forecasts = data.transactions.filter((other) => other.status === 'forecast' && other.installment?.groupId === tx.installment.groupId);
  const total = forecasts.reduce((sum, other) => sum + Math.abs(other.amountCents), 0);
  return {
    summary: `Cancelar ${forecasts.length} parcelas futuras previstas de "${tx.payee || tx.description}" (total de R$ ${(total / 100).toFixed(2).replace('.', ',')}). Use quando a compra foi antecipada, estornada ou quitada.`,
    details: { forecasts: forecasts.length, totalCents: total },
  };
}
