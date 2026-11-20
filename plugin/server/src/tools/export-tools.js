import { month, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { exportReports } from '../export/workbooks.js';
import { today } from '../lib/dates.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const exportTools = [
  {
    name: 'export_spreadsheet',
    title: 'Gerar planilha Excel',
    description:
      'Gera uma planilha .xlsx na pasta "planilhas" com fluxo de caixa, gastos por competência, lançamentos, compromissos futuros e carteira. Informe o caminho do arquivo ao usuário.',
    inputSchema: object({ to_month: month, months: { type: 'integer', minimum: 1, maximum: 36 } }),
    handler: (input) => exportReports(requireStore(), { toMonth: input.to_month ?? today().slice(0, 7), months: input.months ?? 12 }),
  },
];
