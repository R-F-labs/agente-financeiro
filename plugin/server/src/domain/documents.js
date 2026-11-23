import { toCents } from '../lib/money.js';
import { isIsoDate, monthOf } from '../lib/dates.js';
import { newId, normalizeText, payeeKey } from '../lib/text.js';
import { ensure, UserError } from '../lib/errors.js';
import { validateBankStatement, validateCardInvoice, validateInvestmentStatement, DEFAULT_TOLERANCE_CENTS } from './validation.js';
import { dedupKeys } from './dedup.js';
import { matchRule, findCategory } from './categories.js';
import { extractTaxId, formatTaxId } from '../lib/tax-id.js';
import { findForecastFor, buildForecasts, newInstallmentGroupId } from './installments.js';
import { reconcile, pendingItem } from './reconciliation.js';

/**
 * Registers a bank statement extracted by the assistant.
 * Nothing is saved when validation fails, unless `force` is true (the user reviewed it).
 *
 * @param {import('../storage/store.js').Store} store
 * @param {any} input
 */
export function registerBankStatement(store, input) {
  const account = requireAccount(store, input.account_id, ['checking', 'savings', 'investment']);
  assertPeriod(input.period_start, input.period_end);

  const lines = chronological(
    input.transactions.map((raw, index) => ({
      index,
      date: requireDate(raw.date, `transactions[${index}].date`),
      competenceDate: raw.competence_date ? requireDate(raw.competence_date, `transactions[${index}].competence_date`) : null,
      description: String(raw.description).trim(),
      payee: raw.payee ? String(raw.payee).trim() : null,
      kind: raw.kind ?? null,
      amountCents: toCents(raw.amount),
      balanceAfterCents: raw.balance_after === undefined || raw.balance_after === null ? null : toCents(raw.balance_after),
    })),
  );

  const totals = {
    openingBalanceCents: toCents(input.totals.opening_balance),
    closingBalanceCents: toCents(input.totals.closing_balance),
    inflowsCents: input.totals.inflows === undefined || input.totals.inflows === null ? null : toCents(input.totals.inflows),
    outflowsCents: input.totals.outflows === undefined || input.totals.outflows === null ? null : toCents(input.totals.outflows),
  };
  const validation = validateBankStatement(totals, lines, input.tolerance_cents ?? account.toleranceCents ?? DEFAULT_TOLERANCE_CENTS);
  if (!validation.ok && !input.force) return rejected(validation);

  return store.transact((data) => {
    const document = createDocument(data, 'bank_statement', account, input, totals, validation, lines.length);
    const keys = dedupKeys(account.id, lines);
    const existing = new Set(data.transactions.map((tx) => tx.dedupKey).filter(Boolean));
    const created = [];
    lines.forEach((line, i) => {
      if (existing.has(keys[i])) {
        document.duplicatesSkipped += 1;
        return;
      }
      existing.add(keys[i]);
      const tx = baseTransaction(data, {
        accountId: account.id,
        documentId: document.id,
        date: line.competenceDate ?? line.date,
        cashDate: line.date,
        amountCents: line.amountCents,
        description: line.description,
        payee: line.payee,
        kind: line.kind,
        balanceAfterCents: line.balanceAfterCents,
        dedupKey: keys[i],
      });
      data.transactions.push(tx);
      created.push(tx);
    });
    document.linesAdded = created.length;
    const reconciliation = reconcile(data, created.map((tx) => tx.id));
    return result(data, document, created, reconciliation);
  });
}

/**
 * Registers a credit card invoice. Amounts arrive as printed on the invoice
 * (charges positive, refunds and payments negative) and are stored from the
 * account holder's perspective (expenses negative).
 *
 * @param {import('../storage/store.js').Store} store
 * @param {any} input
 */
export function registerCardInvoice(store, input) {
  const account = requireAccount(store, input.account_id, ['credit_card']);
  assertPeriod(input.period_start, input.period_end);
  const dueDate = requireDate(input.due_date, 'due_date');

  const lines = input.transactions.map((raw, index) => {
    const lineType = raw.line_type ?? 'purchase';
    const amountCents = toCents(raw.amount);
    const line = {
      index,
      date: requireDate(raw.date, `transactions[${index}].date`),
      competenceDate: raw.competence_date ? requireDate(raw.competence_date, `transactions[${index}].competence_date`) : null,
      description: String(raw.description).trim(),
      payee: raw.payee ? String(raw.payee).trim() : null,
      lineType,
      amountCents,
      cardLast4: raw.card_last4 ?? null,
      installment: raw.installment ?? null,
      financed: null,
    };
    if (raw.financed) {
      const principal = toCents(raw.financed.principal);
      const charges = toCents(raw.financed.charges);
      ensure(
        Math.abs(principal + charges - amountCents) <= 1,
        `transactions[${index}].financed: principal + encargos precisa ser igual ao valor da linha.`,
      );
      line.financed = { principalCents: principal, chargesCents: charges };
    }
    if (line.installment) {
      ensure(
        Number.isInteger(line.installment.number) && Number.isInteger(line.installment.total) && line.installment.number >= 1 && line.installment.number <= line.installment.total,
        `transactions[${index}].installment inválido.`,
      );
    }
    return line;
  });

  const totals = {
    totalCents: toCents(input.totals.total),
    previousBalanceCents: input.totals.previous_balance === undefined ? null : toCents(input.totals.previous_balance),
    previousPaymentCents: input.totals.previous_payment === undefined ? null : toCents(input.totals.previous_payment),
    nextInvoiceOpenCents: input.totals.next_invoice_open === undefined ? null : toCents(input.totals.next_invoice_open),
  };
  const validation = validateCardInvoice(totals, lines, input.tolerance_cents ?? account.toleranceCents ?? 5);
  if (!validation.ok && !input.force) return rejected(validation);

  return store.transact((data) => {
    const document = createDocument(data, 'card_invoice', account, input, totals, validation, lines.length);
    document.dueDate = dueDate;
    const storable = lines.filter((line) => line.lineType !== 'previous_balance' && line.lineType !== 'previous_payment');
    const keys = dedupKeys(account.id, storable);
    const existing = new Set(data.transactions.map((tx) => tx.dedupKey).filter(Boolean));
    const created = [];
    const debtCategory = findCategory(data.categories, 'Juros e IOF');
    const renegotiationCategory = findCategory(data.categories, 'Renegociação');

    storable.forEach((line, i) => {
      if (existing.has(keys[i])) {
        document.duplicatesSkipped += 1;
        return;
      }
      existing.add(keys[i]);
      const common = {
        accountId: account.id,
        documentId: document.id,
        date: line.competenceDate ?? line.date,
        cashDate: dueDate,
        description: line.description,
        payee: line.payee,
        cardLast4: line.cardLast4,
        lineType: line.lineType,
      };

      if (line.financed) {
        const principal = baseTransaction(data, { ...common, amountCents: -line.financed.principalCents, dedupKey: keys[i] });
        const charges = baseTransaction(data, {
          ...common,
          amountCents: -line.financed.chargesCents,
          dedupKey: `${keys[i]}:charges`,
          description: `Juros e IOF: ${line.description}`,
          payee: 'Juros e IOF de crédito',
          debtCost: true,
        });
        if (debtCategory) {
          charges.categoryId = debtCategory.id;
          charges.categorySource = 'rule';
        }
        data.transactions.push(principal, charges);
        created.push(principal, charges);
        return;
      }

      const tx = baseTransaction(data, { ...common, amountCents: -line.amountCents, dedupKey: keys[i] });
      if (line.lineType === 'interest' || line.lineType === 'iof') tx.debtCost = true;
      if (line.lineType === 'financing') {
        tx.debt = true;
        if (renegotiationCategory && !tx.categoryId) {
          tx.categoryId = renegotiationCategory.id;
          tx.categorySource = 'rule';
        }
      }

      if (line.installment) {
        const forecast = findForecastFor(data.transactions, {
          accountId: account.id,
          payeeKey: tx.payeeKey,
          amountCents: tx.amountCents,
          date: tx.date,
          installment: line.installment,
        });
        if (forecast) {
          Object.assign(forecast, {
            status: 'confirmed',
            documentId: document.id,
            dedupKey: keys[i],
            amountCents: tx.amountCents,
            date: tx.date,
            cashDate: dueDate,
            description: tx.description,
          });
          created.push(forecast);
          document.installmentsConfirmed += 1;
          return;
        }
        tx.installment = { number: line.installment.number, total: line.installment.total, groupId: newInstallmentGroupId() };
        data.transactions.push(tx);
        created.push(tx);
        const forecasts = buildForecasts(tx, dueDate);
        data.transactions.push(...forecasts);
        document.forecastsCreated += forecasts.length;
        return;
      }

      data.transactions.push(tx);
      created.push(tx);
    });

    document.linesAdded = created.length;
    checkNextInvoice(data, account, document, totals);
    const reconciliation = reconcile(data, [document.id, ...created.map((tx) => tx.id)]);
    return result(data, document, created, reconciliation);
  });
}

/**
 * Registers an investment statement: one position per asset for the month of the period end.
 * @param {import('../storage/store.js').Store} store
 * @param {any} input
 */
export function registerInvestmentStatement(store, input) {
  const account = requireAccount(store, input.account_id, ['investment']);
  assertPeriod(input.period_start, input.period_end);
  const positions = input.positions.map((raw) => ({
    asset: String(raw.asset).trim(),
    openingCents: toCents(raw.opening ?? 0),
    contributionsCents: toCents(raw.contributions ?? 0),
    withdrawalsCents: Math.abs(toCents(raw.withdrawals ?? 0)),
    incomeCents: toCents(raw.income ?? 0),
    taxesAndFeesCents: Math.abs(toCents(raw.taxes_and_fees ?? 0)),
    closingCents: toCents(raw.closing),
  }));
  const totals = {
    openingTotalCents: input.totals?.opening_total === undefined ? null : toCents(input.totals.opening_total),
    closingTotalCents: input.totals?.closing_total === undefined ? null : toCents(input.totals.closing_total),
  };
  const validation = validateInvestmentStatement(totals, positions, input.tolerance_cents ?? DEFAULT_TOLERANCE_CENTS);
  if (!validation.ok && !input.force) return rejected(validation);

  return store.transact((data) => {
    const document = createDocument(data, 'investment_statement', account, input, totals, validation, positions.length);
    const month = monthOf(input.period_end);
    const newAssets = [];
    for (const position of positions) {
      const key = normalizeText(position.asset);
      let asset = data.assets.find((item) => item.accountId === account.id && item.key === key);
      if (!asset) {
        asset = {
          id: newId('ast'),
          accountId: account.id,
          key,
          name: position.asset,
          assetClass: null,
          indexer: null,
          contractedRate: null,
          maturityDate: null,
          liquidity: null,
          ticker: null,
          active: true,
          createdAt: new Date().toISOString(),
        };
        data.assets.push(asset);
        newAssets.push(asset);
        data.pending.push(
          pendingItem('asset_unmapped', {
            assetId: asset.id,
            message: `Classifique o ativo "${asset.name}" (classe, indexador, taxa, vencimento, liquidez e ticker) com update_asset.`,
          }),
        );
      }
      const existingIndex = data.positions.findIndex((item) => item.assetId === asset.id && item.month === month);
      const record = { assetId: asset.id, accountId: account.id, month, documentId: document.id, ...omitAsset(position) };
      if (existingIndex >= 0) data.positions[existingIndex] = record;
      else data.positions.push(record);
    }
    document.linesAdded = positions.length;
    return {
      status: validation.ok ? 'registered' : 'registered_with_differences',
      document: publicDocument(document),
      validation,
      newAssets: newAssets.map((asset) => ({ id: asset.id, name: asset.name })),
      nextSteps: newAssets.length > 0 ? ['Classifique os ativos novos com update_asset.'] : [],
    };
  });
}

function checkNextInvoice(data, account, document, totals) {
  if (totals.nextInvoiceOpenCents === null) return;
  const nextDue = data.transactions.filter(
    (tx) => tx.accountId === account.id && tx.status === 'forecast' && tx.cashDate > document.dueDate && tx.cashDate <= addMonthsSafe(document.dueDate, 1),
  );
  const forecastTotal = -nextDue.reduce((acc, tx) => acc + tx.amountCents, 0);
  if (Math.abs(forecastTotal - totals.nextInvoiceOpenCents) > 100) {
    data.pending.push(
      pendingItem('installment_mismatch', {
        documentId: document.id,
        message:
          `A fatura informa saldo em aberto para a próxima fatura de ${(totals.nextInvoiceOpenCents / 100).toFixed(2)}, ` +
          `mas as parcelas previstas somam ${(forecastTotal / 100).toFixed(2)}. Pode haver parcelas de compras anteriores ao início do uso do agente.`,
      }),
    );
  }
}

function addMonthsSafe(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, Math.min(d, 28)));
  return date.toISOString().slice(0, 10);
}

function baseTransaction(data, fields) {
  const amountCents = fields.amountCents;
  const tx = {
    id: newId('tx'),
    accountId: fields.accountId,
    documentId: fields.documentId,
    date: fields.date,
    cashDate: fields.cashDate ?? fields.date,
    amountCents,
    description: fields.description,
    payee: fields.payee ?? null,
    payeeKey: payeeKey(fields.payee || fields.description),
    counterpartyTaxId: extractTaxId(fields.payee, fields.description),
    kind: fields.kind ?? null,
    lineType: fields.lineType ?? null,
    cardLast4: fields.cardLast4 ?? null,
    balanceAfterCents: fields.balanceAfterCents ?? null,
    dedupKey: fields.dedupKey ?? null,
    nature: amountCents >= 0 ? 'income' : 'expense',
    status: 'confirmed',
    categoryId: null,
    categorySource: null,
    installment: null,
    linkedTransactionId: null,
    debtCost: fields.debtCost ?? false,
    debt: false,
    notes: null,
    createdAt: new Date().toISOString(),
  };
  const rule = matchRule(data.categoryRules, tx.payee || tx.description, tx.counterpartyTaxId);
  if (rule) {
    tx.categoryId = rule.categoryId;
    tx.categorySource = 'rule';
    rule.hits = (rule.hits ?? 0) + 1;
    rule.lastUsedAt = tx.createdAt;
  }
  return tx;
}

function createDocument(data, type, account, input, totals, validation, linesReceived) {
  const document = {
    id: newId('doc'),
    type,
    accountId: account.id,
    institution: input.institution ?? account.institution,
    periodStart: input.period_start,
    periodEnd: input.period_end,
    fileName: input.file_name ?? null,
    totals,
    validation,
    forced: !validation.ok,
    linesReceived,
    linesAdded: 0,
    duplicatesSkipped: 0,
    installmentsConfirmed: 0,
    forecastsCreated: 0,
    registeredAt: new Date().toISOString(),
  };
  data.documents.push(document);
  return document;
}

/**
 * What the agent already knows about a counterparty identified by CPF/CNPJ.
 * @param {any} data
 * @param {{ kind: 'cnpj'|'cpf', digits: string } | null} taxId
 */
function counterpartyHint(data, taxId) {
  if (!taxId) return null;
  const known = (data.counterparties ?? []).find((item) => item.taxId === taxId.digits);
  return { kind: taxId.kind, id: formatTaxId(taxId), known: Boolean(known), name: known?.tradeName || known?.name || null, activity: known?.activity?.description ?? null };
}

function result(data, document, created, reconciliation) {
  const categories = new Map(data.categories.map((category) => [category.id, category.name]));
  const uncategorized = created
    .filter((tx) => tx.status === 'confirmed' && !tx.categoryId && (tx.nature === 'income' || tx.nature === 'expense'))
    .map((tx) => ({
      id: tx.id,
      date: tx.date,
      description: tx.description,
      payee: tx.payee,
      amount: tx.amountCents / 100,
      counterparty: counterpartyHint(data, tx.counterpartyTaxId),
    }));
  const openPending = data.pending.filter((item) => item.status === 'open');
  return {
    status: document.forced ? 'registered_with_differences' : 'registered',
    document: publicDocument(document),
    added: created.length,
    duplicatesSkipped: document.duplicatesSkipped,
    installmentsConfirmed: document.installmentsConfirmed,
    forecastsCreated: document.forecastsCreated,
    categorizedByRules: created.filter((tx) => tx.categorySource === 'rule').map((tx) => ({ id: tx.id, payee: tx.payee ?? tx.description, category: categories.get(tx.categoryId) })),
    uncategorized,
    reconciliation,
    openPending: openPending.length,
    nextSteps: [
      uncategorized.length > 0 ? 'Sugira categorias para as transações sem categoria e confirme com categorize_transactions.' : null,
      uncategorized.some((tx) => tx.counterparty?.kind === 'cnpj' && !tx.counterparty.known)
        ? 'Há lançamentos com CNPJ ainda desconhecido: use lookup_counterparty para descobrir o ramo da empresa antes de sugerir a categoria.'
        : null,
      openPending.length > 0 ? 'Existem pendências abertas: use list_pending e resolva com o usuário.' : null,
    ].filter(Boolean),
  };
}

function rejected(validation) {
  return {
    status: 'validation_failed',
    saved: false,
    validation,
    nextSteps: [
      'Releia o documento conferindo linha a linha (linha omitida, sinal invertido, linha duplicada, subtotal tratado como lançamento, parcela lida com o valor total).',
      'Envie de novo a extração corrigida. Se a diferença persistir, mostre ao usuário e, com a concordância dele, reenvie com force: true.',
    ],
  };
}

function publicDocument(document) {
  const { validation, ...rest } = document;
  return { ...rest, validationOk: validation.ok };
}

function requireAccount(store, accountId, allowedTypes) {
  const account = store.get('accounts').find((item) => item.id === accountId);
  if (!account) throw new UserError(`Conta não encontrada: ${accountId}. Use list_accounts ou upsert_account.`);
  if (!allowedTypes.includes(account.type)) {
    throw new UserError(`A conta ${account.nickname} é do tipo ${account.type}; este documento exige: ${allowedTypes.join(', ')}.`);
  }
  return account;
}

function requireDate(value, field) {
  if (!isIsoDate(value)) throw new UserError(`${field}: data inválida (${value}). Use AAAA-MM-DD.`);
  return value;
}

function assertPeriod(start, end) {
  requireDate(start, 'period_start');
  requireDate(end, 'period_end');
  ensure(start <= end, 'period_start precisa ser anterior a period_end.');
}

function chronological(lines) {
  if (lines.length > 1 && lines[0].date > lines[lines.length - 1].date) return [...lines].reverse();
  return lines;
}

function omitAsset(position) {
  const { asset, ...rest } = position;
  return rest;
}
