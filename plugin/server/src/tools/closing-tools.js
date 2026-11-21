import { month, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { buildMonthlyPackage } from '../domain/closing.js';
import { newId } from '../lib/text.js';
import { today } from '../lib/dates.js';
import { UserError } from '../lib/errors.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const closingTools = [
  {
    name: 'prepare_monthly_package',
    title: 'Preparar pacote do fechamento',
    description:
      'Monta o pacote do fechamento do mês com todas as contas prontas: fluxo de caixa, desvios, compromissos, reserva, metas com aporte necessário, carteira contra referência, mercado, valor disponível para investir, decisões recentes e lacunas de dados. Use como única fonte de números para a análise.',
    inputSchema: object({ month }, ['month']),
    annotations: { readOnlyHint: true },
    handler: (input) => buildMonthlyPackage(requireStore().data, input.month, today()),
  },
  {
    name: 'save_monthly_analysis',
    title: 'Salvar análise do mês',
    description:
      'Guarda a análise do fechamento (diagnóstico, metas, reserva, carteira, cenários, decisões, dados faltantes e alertas) e registra cada decisão como pendente de resposta do usuário. Substitui a análise anterior do mesmo mês.',
    inputSchema: object(
      {
        month,
        summary: { type: 'string', minLength: 10 },
        analysis: { type: 'object', description: 'Objeto completo no formato do roteiro de fechamento.' },
        decisions: {
          type: 'array',
          items: object(
            {
              priority: { type: 'integer', minimum: 1 },
              action: { type: 'string', minLength: 3 },
              amount: { type: ['number', 'null'] },
              justification: { type: 'string' },
              risk: { type: 'string' },
              conservative_alternative: { type: 'string' },
              deadline: { type: 'string' },
            },
            ['priority', 'action'],
          ),
        },
      },
      ['month', 'summary', 'decisions'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    confirm: confirmAnalysisReplacement,
    handler: (input) =>
      requireStore().transact((data) => {
        data.analyses = data.analyses.filter((analysis) => analysis.month !== input.month);
        data.decisions = data.decisions.filter((decision) => !(decision.month === input.month && decision.status === 'pending'));
        data.analyses.push({ id: newId('ana'), month: input.month, summary: input.summary, analysis: input.analysis ?? null, createdAt: new Date().toISOString() });
        const decisions = input.decisions
          .sort((a, b) => a.priority - b.priority)
          .map((decision) => ({
            id: newId('dec'),
            month: input.month,
            priority: decision.priority,
            action: decision.action,
            amount: decision.amount ?? null,
            justification: decision.justification ?? null,
            risk: decision.risk ?? null,
            conservativeAlternative: decision.conservative_alternative ?? null,
            deadline: decision.deadline ?? null,
            status: 'pending',
            createdAt: new Date().toISOString(),
          }));
        data.decisions.push(...decisions);
        return { saved: true, decisions: decisions.map(({ id, priority, action }) => ({ id, priority, action })) };
      }),
  },
  {
    name: 'list_decisions',
    title: 'Listar decisões',
    description: 'Lista as decisões recomendadas e a resposta do usuário (aceita, recusada, adiada, pendente).',
    inputSchema: object({ month, status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'postponed'] } }),
    annotations: { readOnlyHint: true },
    handler: (input) => ({
      decisions: requireStore()
        .get('decisions')
        .filter((decision) => (!input.month || decision.month === input.month) && (!input.status || decision.status === input.status))
        .sort((a, b) => b.month.localeCompare(a.month) || a.priority - b.priority),
    }),
  },
  {
    name: 'update_decision',
    title: 'Registrar resposta a uma decisão',
    description: 'Registra se o usuário aceitou, recusou ou adiou uma recomendação, com uma observação opcional. O sistema não executa nenhuma operação.',
    inputSchema: object(
      { decision_id: { type: 'string' }, status: { type: 'string', enum: ['accepted', 'rejected', 'postponed'] }, note: { type: 'string' } },
      ['decision_id', 'status'],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    handler: (input) =>
      requireStore().transact((data) => {
        const decision = data.decisions.find((item) => item.id === input.decision_id);
        if (!decision) throw new UserError(`Decisão não encontrada: ${input.decision_id}`);
        decision.status = input.status;
        decision.note = input.note ?? decision.note ?? null;
        decision.decidedAt = new Date().toISOString();
        return { saved: true, decision };
      }),
  },
];

function confirmAnalysisReplacement({ month }) {
  const data = requireStore().data;
  const existing = data.analyses.find((analysis) => analysis.month === month);
  if (!existing) return null;
  const pending = data.decisions.filter((decision) => decision.month === month && decision.status === 'pending').length;
  return {
    summary: `Substituir a análise já salva de ${month} (de ${existing.createdAt.slice(0, 10)}) e as ${pending} decisões dela ainda sem resposta. Decisões já respondidas pelo usuário são mantidas.`,
    details: { month, previousAnalysisAt: existing.createdAt, pendingDecisionsReplaced: pending },
  };
}
