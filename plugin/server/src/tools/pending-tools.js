import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { UserError } from '../lib/errors.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const pendingTools = [
  {
    name: 'list_pending',
    title: 'Listar pendências',
    description:
      'Lista o que precisa de decisão do usuário: transferências sem a outra ponta, conciliações ambíguas, pagamentos de fatura sem fatura, ativos sem classificação, parcelas divergentes.',
    inputSchema: object({ include_resolved: { type: 'boolean' } }),
    annotations: { readOnlyHint: true },
    handler: ({ include_resolved }) => {
      const data = requireStore().data;
      const transactions = new Map(data.transactions.map((tx) => [tx.id, tx]));
      return {
        pending: data.pending
          .filter((item) => include_resolved || item.status === 'open')
          .map((item) => {
            const tx = item.transactionId ? transactions.get(item.transactionId) : undefined;
            return {
              ...item,
              transaction: tx
                ? { date: tx.date, description: tx.description, payee: tx.payee, amountCents: tx.amountCents, accountId: tx.accountId }
                : undefined,
            };
          }),
      };
    },
  },
  {
    name: 'resolve_pending',
    title: 'Resolver pendência',
    description:
      'Marca uma pendência como resolvida, registrando a decisão. Faça antes os ajustes necessários (update_transaction, categorize_transactions, update_asset).',
    inputSchema: object({ pending_id: { type: 'string' }, resolution: { type: 'string', minLength: 3 } }, ['pending_id', 'resolution']),
    handler: ({ pending_id, resolution }) =>
      requireStore().transact((data) => {
        const item = data.pending.find((candidate) => candidate.id === pending_id);
        if (!item) throw new UserError(`Pendência não encontrada: ${pending_id}`);
        item.status = 'resolved';
        item.resolution = resolution;
        item.resolvedAt = new Date().toISOString();
        return { resolved: true, remaining: data.pending.filter((candidate) => candidate.status === 'open').length };
      }),
  },
];
