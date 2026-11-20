import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { updateMarketData } from '../market/market-service.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const marketTools = [
  {
    name: 'update_market_data',
    title: 'Atualizar dados de mercado',
    description:
      'Busca na internet Selic, CDI 12 meses, IPCA, IGP-M, dólar, expectativas do Focus (Banco Central) e cotações dos ativos com ticker (brapi.dev, exige token). Chame antes do fechamento do mês ou quando os dados tiverem mais de um dia.',
    inputSchema: object({}),
    annotations: { openWorldHint: true },
    handler: () => updateMarketData(requireStore()),
  },
  {
    name: 'get_market_data',
    title: 'Ver dados de mercado',
    description: 'Mostra os últimos indicadores e cotações guardados, com a data de atualização.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
    handler: () => requireStore().get('market'),
  },
];
