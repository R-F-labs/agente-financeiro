import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { lookupCounterparty } from '../market/counterparty-service.js';
import { formatTaxId } from '../lib/tax-id.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const counterpartyTools = [
  {
    name: 'lookup_counterparty',
    title: 'Pesquisar quem recebeu ou pagou',
    description:
      'Descobre o ramo de uma empresa pelo CNPJ (cadastro público da Receita Federal, via BrasilAPI) e sugere a categoria. Informe tax_id ou transaction_id (de um lançamento com CNPJ na descrição). O resultado fica guardado: as próximas vezes não consultam de novo. CPF nunca é consultado.',
    inputSchema: object({
      tax_id: { type: 'string', description: 'CNPJ ou CPF, com ou sem pontuação.' },
      transaction_id: { type: 'string' },
      refresh: { type: 'boolean', description: 'Consulta de novo mesmo se já estiver guardado.' },
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    handler: (input) => lookupCounterparty(requireStore(), input),
  },
  {
    name: 'list_counterparties',
    title: 'Listar empresas conhecidas',
    description: 'Lista as empresas (por CNPJ) que o agente já pesquisou, com o ramo e a categoria aprendida para cada uma.',
    inputSchema: object({ search: { type: 'string' } }),
    annotations: { readOnlyHint: true },
    handler: ({ search }) => {
      const store = requireStore();
      const names = new Map(store.get('categories').map((category) => [category.id, category.name]));
      const rules = new Map(store.get('categoryRules').filter((rule) => rule.taxId).map((rule) => [rule.taxId, rule]));
      const term = search?.toUpperCase();
      return {
        counterparties: (store.get('counterparties') ?? [])
          .filter((item) => !term || `${item.name} ${item.tradeName ?? ''}`.toUpperCase().includes(term))
          .map((item) => ({
            taxId: formatTaxId({ kind: 'cnpj', digits: item.taxId }),
            name: item.tradeName || item.name,
            activity: item.activity?.description ?? null,
            category: names.get(rules.get(item.taxId)?.categoryId) ?? null,
            checkedAt: item.checkedAt,
          })),
      };
    },
  },
];
