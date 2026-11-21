import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { newId } from '../lib/text.js';
import { UserError } from '../lib/errors.js';

const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'investment'];

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const accountTools = [
  {
    name: 'list_accounts',
    title: 'Listar contas',
    description: 'Lista contas correntes, poupanças, cartões de crédito e contas de investimento cadastradas.',
    inputSchema: object({ include_inactive: { type: 'boolean' } }),
    annotations: { readOnlyHint: true },
    handler: ({ include_inactive }) => ({
      accounts: requireStore()
        .get('accounts')
        .filter((account) => include_inactive || account.active !== false),
    }),
  },
  {
    name: 'upsert_account',
    title: 'Cadastrar ou alterar conta',
    description:
      'Cadastra uma conta (sem account_id) ou altera uma existente. Tipos: checking (conta corrente), savings (poupança), credit_card (cartão), investment (corretora/investimentos). Guarde só os 4 últimos dígitos.',
    inputSchema: object(
      {
        account_id: { type: 'string', description: 'Informe para alterar uma conta existente.' },
        institution: { type: 'string', minLength: 2, description: 'Banco ou corretora, ex.: Santander, Nubank, XP.' },
        type: { type: 'string', enum: ACCOUNT_TYPES },
        nickname: { type: 'string', minLength: 2, description: 'Nome curto, ex.: "Santander conta" ou "Nubank cartão".' },
        last4: { type: 'string', pattern: '^\\d{1,4}$', description: 'Últimos dígitos da conta.' },
        card_last4s: { type: 'array', items: { type: 'string', pattern: '^\\d{4}$' }, description: 'Finais dos cartões (físico e virtual).' },
        tolerance_cents: { type: 'integer', minimum: 0, maximum: 500, description: 'Tolerância de conferência em centavos (padrão 1; faturas 5).' },
        expects_monthly_document: { type: 'boolean', description: 'Se espera um documento todo mês (usado no fechamento).' },
        active: { type: 'boolean' },
      },
      [],
    ),
    annotations: { readOnlyHint: false, destructiveHint: true },
    confirm: confirmAccountDeactivation,
    handler: (input) =>
      requireStore().transact((data) => {
        if (input.account_id) {
          const account = data.accounts.find((item) => item.id === input.account_id);
          if (!account) throw new UserError(`Conta não encontrada: ${input.account_id}`);
          applyAccountFields(account, input);
          account.updatedAt = new Date().toISOString();
          return { saved: true, account };
        }
        for (const field of ['institution', 'type', 'nickname']) {
          if (!input[field]) throw new UserError(`Para cadastrar uma conta, informe ${field}.`);
        }
        const account = {
          id: newId('acc'),
          active: true,
          expectsMonthlyDocument: true,
          cardLast4s: [],
          createdAt: new Date().toISOString(),
        };
        applyAccountFields(account, input);
        data.accounts.push(account);
        return { saved: true, account };
      }),
  },
];

function applyAccountFields(account, input) {
  const map = {
    institution: 'institution',
    type: 'type',
    nickname: 'nickname',
    last4: 'last4',
    card_last4s: 'cardLast4s',
    tolerance_cents: 'toleranceCents',
    expects_monthly_document: 'expectsMonthlyDocument',
    active: 'active',
  };
  for (const [inputKey, key] of Object.entries(map)) {
    if (input[inputKey] !== undefined) account[key] = input[inputKey];
  }
}

function confirmAccountDeactivation(input) {
  if (!input.account_id || input.active !== false) return null;
  const data = requireStore().data;
  const account = data.accounts.find((item) => item.id === input.account_id);
  if (!account || account.active === false) return null;
  const transactions = data.transactions.filter((tx) => tx.accountId === account.id).length;
  return {
    summary: `Desativar a conta "${account.nickname}". Os ${transactions} lançamentos dela continuam guardados, mas a conta deixa de ser cobrada no fechamento mensal.`,
    details: { accountId: account.id, transactions },
  };
}
