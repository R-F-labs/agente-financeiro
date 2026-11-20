import { object } from './schemas.js';
import { requireStore, setupWorkspace, workspaceStatus } from '../storage/workspace.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const workspaceTools = [
  {
    name: 'get_status',
    title: 'Situação do Agente Financeiro',
    description:
      'Mostra se o agente já foi configurado, onde ficam os dados e um resumo do que está registrado (contas, documentos, pendências, perfil). Chame no início de cada conversa.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
    handler: () => {
      const status = workspaceStatus();
      if (!status.configured) {
        return {
          configured: false,
          suggestedDataDir: status.suggestedDataDir,
          nextSteps: ['Pergunte ao usuário onde guardar os dados (sugira uma pasta sincronizada com a nuvem) e chame setup_workspace.'],
        };
      }
      const store = requireStore();
      const data = store.data;
      return {
        configured: true,
        dataDir: status.dataDir,
        spreadsheetsDir: store.layout.spreadsheets,
        profileFilled: Boolean(data.profile?.riskTolerance),
        accounts: data.accounts.filter((account) => account.active !== false).length,
        goals: data.goals.filter((goal) => goal.active !== false).length,
        documents: data.documents.length,
        transactions: data.transactions.filter((tx) => tx.status === 'confirmed').length,
        openPending: data.pending.filter((item) => item.status === 'open').length,
        lastDocumentAt: data.documents.at(-1)?.registeredAt ?? null,
        marketUpdatedAt: data.market?.updatedAt ?? null,
        lastAnalysisMonth: data.analyses.map((analysis) => analysis.month).sort().at(-1) ?? null,
      };
    },
  },
  {
    name: 'setup_workspace',
    title: 'Configurar pasta de dados',
    description:
      'Define a pasta do computador onde os dados ficam guardados e cria a estrutura (dados, backups e planilhas). Use um caminho completo. Pode ser chamada de novo para apontar para outra pasta.',
    inputSchema: object({ data_dir: { type: 'string', minLength: 2, description: 'Caminho completo da pasta. Aceita ~ para a pasta do usuário.' } }, ['data_dir']),
    annotations: { idempotentHint: true },
    handler: ({ data_dir }) => {
      const result = setupWorkspace(data_dir);
      return {
        dataDir: result.dataDir,
        dataFile: result.layout.dataFile,
        backupsDir: result.layout.backups,
        spreadsheetsDir: result.layout.spreadsheets,
        nextSteps: ['Siga o roteiro de configuração: perfil, contas, metas e primeiro documento.'],
      };
    },
  },
];
