import { amount, optionalAmount, date, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { registerBankStatement, registerCardInvoice, registerInvestmentStatement } from '../domain/documents.js';

const common = {
  account_id: { type: 'string', minLength: 3 },
  institution: { type: 'string' },
  file_name: { type: 'string', description: 'Nome do arquivo PDF, para referência.' },
  period_start: date,
  period_end: date,
  tolerance_cents: { type: 'integer', minimum: 0, maximum: 500 },
  force: {
    type: 'boolean',
    description: 'Somente após mostrar a diferença ao usuário e ele concordar: grava mesmo sem fechar com os totais.',
  },
};

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const documentTools = [
  {
    name: 'register_bank_statement',
    title: 'Registrar extrato bancário',
    description:
      'Registra os lançamentos de um extrato de conta corrente ou poupança lidos do PDF. O servidor confere com os totais do documento (saldo inicial + movimentos = saldo final, entradas, saídas e saldo por linha, quando houver) e só grava se fechar. Valores: entradas positivas, saídas negativas. Lançamentos repetidos de extratos anteriores são ignorados automaticamente.',
    inputSchema: object(
      {
        ...common,
        totals: object(
          {
            opening_balance: amount,
            closing_balance: amount,
            inflows: optionalAmount,
            outflows: optionalAmount,
          },
          ['opening_balance', 'closing_balance'],
        ),
        transactions: {
          type: 'array',
          minItems: 1,
          items: object(
            {
              date: date,
              description: { type: 'string', minLength: 1, description: 'Descrição como impressa (tipo + complemento).' },
              payee: { type: 'string', description: 'Beneficiário ou pagador limpo, sem códigos.' },
              amount,
              balance_after: optionalAmount,
              competence_date: { ...date, description: 'Quando o lançamento se refere a outro mês (tarifa, juros, IOF).' },
              kind: {
                type: 'string',
                enum: ['pix_sent', 'pix_received', 'transfer', 'automatic_debit', 'bill_payment', 'debit_card', 'fee', 'interest', 'iof', 'yield', 'salary', 'other'],
              },
            },
            ['date', 'description', 'amount'],
          ),
        },
      },
      ['account_id', 'period_start', 'period_end', 'totals', 'transactions'],
    ),
    handler: (input) => registerBankStatement(requireStore(), input),
  },
  {
    name: 'register_card_invoice',
    title: 'Registrar fatura de cartão',
    description:
      'Registra uma fatura de cartão de crédito. Envie os valores como impressos na fatura: compras positivas, estornos e pagamentos negativos. Fatura anterior e pagamento recebido entram em totals e também como linhas previous_balance/previous_payment. Parcelas ("Parcela 2/6") geram ou confirmam previsões das próximas faturas. Pix e boleto no crédito com juros devem vir com financed (principal e encargos).',
    inputSchema: object(
      {
        ...common,
        due_date: date,
        totals: object(
          {
            total: amount,
            previous_balance: amount,
            previous_payment: amount,
            next_invoice_open: { ...amount, description: 'Saldo em aberto da próxima fatura (parcelas futuras), quando impresso.' },
          },
          ['total'],
        ),
        transactions: {
          type: 'array',
          minItems: 1,
          items: object(
            {
              date: date,
              description: { type: 'string', minLength: 1 },
              payee: { type: 'string' },
              amount,
              line_type: {
                type: 'string',
                enum: ['purchase', 'refund', 'fee', 'interest', 'iof', 'annual_fee', 'financing', 'previous_balance', 'previous_payment', 'other'],
              },
              card_last4: { type: 'string', pattern: '^\\d{4}$' },
              installment: object({ number: { type: 'integer', minimum: 1 }, total: { type: 'integer', minimum: 1 } }, ['number', 'total']),
              financed: object({ principal: amount, charges: amount }, ['principal', 'charges']),
              competence_date: date,
            },
            ['date', 'description', 'amount'],
          ),
        },
      },
      ['account_id', 'period_start', 'period_end', 'due_date', 'totals', 'transactions'],
    ),
    handler: (input) => registerCardInvoice(requireStore(), input),
  },
  {
    name: 'register_investment_statement',
    title: 'Registrar extrato de investimentos',
    description:
      'Registra as posições de um extrato de investimentos (uma por ativo, com o nome exatamente como no extrato). Confere saldo inicial + aplicações - resgates + rendimentos - impostos/taxas = saldo final. Ativos novos geram pendência de classificação.',
    inputSchema: object(
      {
        ...common,
        totals: object({ opening_total: amount, closing_total: amount }),
        positions: {
          type: 'array',
          minItems: 1,
          items: object(
            {
              asset: { type: 'string', minLength: 2 },
              opening: amount,
              contributions: amount,
              withdrawals: amount,
              income: amount,
              taxes_and_fees: amount,
              closing: amount,
            },
            ['asset', 'closing'],
          ),
        },
      },
      ['account_id', 'period_start', 'period_end', 'positions'],
    ),
    handler: (input) => registerInvestmentStatement(requireStore(), input),
  },
  {
    name: 'list_documents',
    title: 'Listar documentos registrados',
    description: 'Lista os documentos já registrados, com período, conta e resultado da conferência.',
    inputSchema: object({ account_id: { type: 'string' } }),
    annotations: { readOnlyHint: true },
    handler: ({ account_id }) => ({
      documents: requireStore()
        .get('documents')
        .filter((doc) => !account_id || doc.accountId === account_id)
        .map(({ validation, totals, ...doc }) => ({ ...doc, validationOk: validation.ok })),
    }),
  },
];
