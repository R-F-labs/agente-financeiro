import { date, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { UserError } from '../lib/errors.js';

const ASSET_CLASSES = [
  'tesouro_selic',
  'tesouro_prefixado',
  'tesouro_ipca',
  'rf_pos_cdi',
  'rf_prefixado',
  'rf_ipca',
  'poupanca',
  'acao',
  'fii',
  'etf',
  'fundo',
  'fora_do_escopo',
  'outro',
];

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const assetTools = [
  {
    name: 'list_assets',
    title: 'Listar ativos',
    description: 'Lista os ativos de investimento conhecidos e a classificação de cada um.',
    inputSchema: object({ unclassified_only: { type: 'boolean' } }),
    annotations: { readOnlyHint: true },
    handler: ({ unclassified_only }) => ({
      assets: requireStore()
        .get('assets')
        .filter((asset) => !unclassified_only || !asset.assetClass),
    }),
  },
  {
    name: 'update_asset',
    title: 'Classificar ativo',
    description:
      'Classifica um ativo: classe, indexador, taxa contratada, vencimento, liquidez e ticker (B3) ou CNPJ (fundos). Não invente dados: se o extrato não informar, pergunte ao usuário. Previdência e cripto: use fora_do_escopo.',
    inputSchema: object(
      {
        asset_id: { type: 'string' },
        asset_class: { type: 'string', enum: ASSET_CLASSES },
        indexer: { type: 'string', enum: ['CDI', 'IPCA', 'SELIC', 'PRE'] },
        contracted_rate: { type: 'string', description: 'Ex.: "110% CDI", "IPCA + 6,2%", "12,5% a.a.".' },
        maturity_date: date,
        liquidity: { type: 'string', description: 'diaria, no_vencimento ou D+n (ex.: D+30).' },
        ticker: { type: 'string', description: 'Ticker na B3, ex.: PETR4, HGLG11.' },
        cnpj: { type: 'string' },
      },
      ['asset_id'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    handler: (input) =>
      requireStore().transact((data) => {
        const asset = data.assets.find((item) => item.id === input.asset_id);
        if (!asset) throw new UserError(`Ativo não encontrado: ${input.asset_id}`);
        const map = {
          asset_class: 'assetClass',
          indexer: 'indexer',
          contracted_rate: 'contractedRate',
          maturity_date: 'maturityDate',
          liquidity: 'liquidity',
          ticker: 'ticker',
          cnpj: 'cnpj',
        };
        for (const [inputKey, key] of Object.entries(map)) if (input[inputKey] !== undefined) asset[key] = input[inputKey];
        if (asset.ticker) asset.ticker = asset.ticker.toUpperCase();
        if (asset.assetClass) {
          for (const item of data.pending) {
            if (item.status === 'open' && item.type === 'asset_unmapped' && item.assetId === asset.id) {
              item.status = 'resolved';
              item.resolution = 'Ativo classificado.';
              item.resolvedAt = new Date().toISOString();
            }
          }
        }
        return { saved: true, asset };
      }),
  },
];
