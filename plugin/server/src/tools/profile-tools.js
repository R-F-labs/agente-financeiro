import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const profileTools = [
  {
    name: 'get_profile',
    title: 'Ver perfil',
    description: 'Retorna o perfil do usuário: nome, dia de fechamento, perfil de investidor, horizonte, meta de reserva, restrições e limites de alerta.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
    handler: () => {
      const profile = requireStore().get('profile');
      if (!profile) return { filled: false };
      const { brapiToken, ...visible } = profile;
      return { filled: true, ...visible, brapiTokenConfigured: Boolean(brapiToken) };
    },
  },
  {
    name: 'update_profile',
    title: 'Atualizar perfil',
    description:
      'Cria ou atualiza o perfil. Envie apenas os campos que mudaram. O nome completo do titular é usado para reconhecer transferências entre as próprias contas.',
    inputSchema: object({
      owner_name: { type: 'string', minLength: 3, description: 'Nome completo do titular, como aparece nos extratos.' },
      closing_day: { type: 'integer', minimum: 1, maximum: 28, description: 'Dia do mês para o fechamento.' },
      risk_tolerance: { type: 'string', enum: ['conservador', 'moderado', 'arrojado'] },
      horizon_years: { type: 'number', minimum: 0, maximum: 60 },
      emergency_months_target: { type: 'number', minimum: 0, maximum: 36, description: 'Quantos meses de despesas a reserva deve cobrir.' },
      restrictions: { type: 'string', description: 'Restrições do usuário (ex.: não investir em ações).' },
      alert_category_percent: { type: 'number', minimum: 0, maximum: 500, description: 'Avisar quando uma categoria passar X% da média.' },
      brapi_token: { type: 'string', description: 'Token gratuito da brapi.dev para cotações de ações e FIIs.' },
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    handler: (input) => {
      const store = requireStore();
      return store.transact((data) => {
        const map = {
          owner_name: 'ownerName',
          closing_day: 'closingDay',
          risk_tolerance: 'riskTolerance',
          horizon_years: 'horizonYears',
          emergency_months_target: 'emergencyMonthsTarget',
          restrictions: 'restrictions',
          alert_category_percent: 'alertCategoryPercent',
          brapi_token: 'brapiToken',
        };
        data.profile = data.profile ?? { createdAt: new Date().toISOString() };
        for (const [inputKey, profileKey] of Object.entries(map)) {
          if (input[inputKey] !== undefined) data.profile[profileKey] = input[inputKey];
        }
        data.profile.updatedAt = new Date().toISOString();
        const { brapiToken, ...visible } = data.profile;
        return { saved: true, profile: { ...visible, brapiTokenConfigured: Boolean(brapiToken) } };
      });
    },
  },
];
