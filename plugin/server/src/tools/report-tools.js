import { month, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { cashFlow, commitments, monthSummary } from '../domain/reports.js';
import { portfolioSnapshot, latestPositionsMonth } from '../domain/portfolio.js';
import { shiftMonth, today } from '../lib/dates.js';
import { UserError } from '../lib/errors.js';

const currentMonth = () => today().slice(0, 7);

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const reportTools = [
  {
    name: 'get_month_summary',
    title: 'Resumo do mês',
    description:
      'Resultado do mês nas visões de caixa e competência, desvios por categoria contra a média dos meses anteriores e custo com juros/IOF. Números já calculados: não recalcule.',
    inputSchema: object({ month }),
    annotations: { readOnlyHint: true },
    handler: (input) => monthSummary(requireStore().data, input.month ?? currentMonth()),
  },
  {
    name: 'get_cash_flow',
    title: 'Fluxo de caixa',
    description: 'Receitas, despesas e resultado por mês e por categoria. view "cash" usa a data de pagamento; "competence" usa a data da compra.',
    inputSchema: object({ from_month: month, to_month: month, view: { type: 'string', enum: ['cash', 'competence'] } }),
    annotations: { readOnlyHint: true },
    handler: (input) => {
      const to = input.to_month ?? currentMonth();
      const from = input.from_month ?? shiftMonth(to, -5);
      if (from > to) throw new UserError('from_month precisa ser anterior a to_month.');
      return { view: input.view ?? 'cash', months: cashFlow(requireStore().data, { fromMonth: from, toMonth: to, view: input.view ?? 'cash' }) };
    },
  },
  {
    name: 'get_commitments',
    title: 'Compromissos futuros',
    description: 'Parcelas previstas para os próximos meses, por mês de pagamento.',
    inputSchema: object({ from_month: month, months: { type: 'integer', minimum: 1, maximum: 36 } }),
    annotations: { readOnlyHint: true },
    handler: (input) => ({ months: commitments(requireStore().data, input.from_month ?? shiftMonth(currentMonth(), 1), input.months ?? 12) }),
  },
  {
    name: 'get_portfolio',
    title: 'Carteira de investimentos',
    description: 'Posição por ativo, participação, liquidez, rentabilidade no mês e em 12 meses, referência (benchmark) e concentração por classe.',
    inputSchema: object({ month }),
    annotations: { readOnlyHint: true },
    handler: (input) => {
      const data = requireStore().data;
      const target = input.month ?? latestPositionsMonth(data);
      if (!target) return { available: false, message: 'Nenhum extrato de investimentos registrado ainda.' };
      return portfolioSnapshot(data, target);
    },
  },
];
