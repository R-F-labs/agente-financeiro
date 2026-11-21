import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { UserError } from '../lib/errors.js';

const OPERATION_LABELS = {
  setup_workspace: 'configuração da pasta',
  update_profile: 'perfil',
  upsert_account: 'conta',
  upsert_category: 'categoria',
  upsert_goal: 'meta',
  register_bank_statement: 'extrato bancário',
  register_card_invoice: 'fatura de cartão',
  register_investment_statement: 'extrato de investimentos',
  categorize_transactions: 'categorização',
  update_transaction: 'ajuste de lançamento',
  resolve_pending: 'pendência resolvida',
  update_asset: 'ativo',
  update_market_data: 'dados de mercado',
  save_monthly_analysis: 'análise do mês',
  update_decision: 'resposta a decisão',
  restore_backup: 'restauração de backup',
};

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const backupTools = [
  {
    name: 'list_changes',
    title: 'Histórico de alterações',
    description:
      'Mostra as últimas alterações feitas nos dados (quando, por qual ação e o que mudou). Use quando o usuário perguntar o que foi feito ou quiser desfazer algo.',
    inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: 200 } }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: ({ limit = 30 }) => ({
      changes: requireStore()
        .readHistory(limit)
        .map((entry) => ({ ...entry, label: OPERATION_LABELS[entry.operation] ?? entry.operation })),
    }),
  },
  {
    name: 'list_backups',
    title: 'Listar backups',
    description:
      'Lista as cópias de segurança: uma antes de cada alteração (últimas 50, com o nome da ação que veio depois) e uma por dia (últimos 30 dias).',
    inputSchema: object({ limit: { type: 'integer', minimum: 1, maximum: 100 } }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: ({ limit = 20 }) => ({
      backups: requireStore()
        .listBackups()
        .slice(0, limit)
        .map((backup) => ({
          ...backup,
          label:
            backup.kind === 'operation'
              ? `Antes de: ${OPERATION_LABELS[backup.beforeOperation] ?? backup.beforeOperation}`
              : 'Cópia diária',
        })),
    }),
  },
  {
    name: 'restore_backup',
    title: 'Restaurar backup',
    description:
      'Volta todos os dados para o estado de um backup (desfaz o que veio depois). Exige confirmação do usuário. O estado atual é guardado antes, então a restauração também pode ser desfeita.',
    inputSchema: object({ backup_id: { type: 'string', minLength: 10, maxLength: 80 } }, ['backup_id']),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    confirm: ({ backup_id }) => {
      const store = requireStore();
      const backup = store.listBackups().find((item) => item.id === backup_id);
      if (!backup) throw new UserError(`Backup não encontrado: ${backup_id}. Use list_backups.`);
      const later = store.readHistory(1000).filter((entry) => entry.at > backup.takenAt).length;
      return {
        summary: `Voltar todos os dados para ${backup.takenAt.replace('T', ' ').slice(0, 16)} (${backup.kind === 'daily' ? 'cópia diária' : `antes de: ${OPERATION_LABELS[backup.beforeOperation] ?? backup.beforeOperation}`}). Isso desfaz ${later} alteração(ões) feitas depois. O estado atual fica guardado em um novo backup.`,
        details: { backupId: backup.id, changesUndone: later },
      };
    },
    handler: ({ backup_id }) => {
      const store = requireStore();
      if (!store.listBackups().some((item) => item.id === backup_id)) throw new UserError(`Backup não encontrado: ${backup_id}.`);
      store.restore(backup_id);
      return { restored: true, backupId: backup_id, nextSteps: ['Chame get_status e conte ao usuário como os dados ficaram.'] };
    },
  },
];
