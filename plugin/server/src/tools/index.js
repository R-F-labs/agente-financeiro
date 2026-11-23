import { workspaceTools } from './workspace-tools.js';
import { profileTools } from './profile-tools.js';
import { accountTools } from './account-tools.js';
import { categoryTools } from './category-tools.js';
import { counterpartyTools } from './counterparty-tools.js';
import { goalTools } from './goal-tools.js';
import { documentTools } from './document-tools.js';
import { transactionTools } from './transaction-tools.js';
import { pendingTools } from './pending-tools.js';
import { reportTools } from './report-tools.js';
import { assetTools } from './asset-tools.js';
import { marketTools } from './market-tools.js';
import { closingTools } from './closing-tools.js';
import { exportTools } from './export-tools.js';
import { fileTools } from './file-tools.js';
import { backupTools } from './backup-tools.js';

/**
 * Every tool exposed by the server, grouped by context.
 * @returns {import('../mcp/registry.js').ToolDefinition[]}
 */
export function allTools() {
  return [
    ...workspaceTools,
    ...profileTools,
    ...accountTools,
    ...categoryTools,
    ...counterpartyTools,
    ...goalTools,
    ...fileTools,
    ...documentTools,
    ...transactionTools,
    ...pendingTools,
    ...reportTools,
    ...assetTools,
    ...marketTools,
    ...closingTools,
    ...exportTools,
    ...backupTools,
  ];
}
