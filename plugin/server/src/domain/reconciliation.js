import { addDays, businessDaysBetween } from '../lib/dates.js';
import { newId, normalizeText } from '../lib/text.js';

const PAYMENT_WINDOW_BEFORE_DAYS = 5;
const PAYMENT_WINDOW_AFTER_DAYS = 3;
const TRANSFER_MAX_BUSINESS_DAYS = 3;
const CARD_PAYMENT_HINT = /FATURA|CARTAO|CARD|NUBANK|PAGAMENTO CART/;

/**
 * Natures that move money between the user's own accounts. They are excluded
 * from income and expense totals.
 */
export const NEUTRAL_NATURES = new Set(['transfer', 'investment_contribution', 'investment_withdrawal', 'card_payment']);

/**
 * Runs every reconciliation rule over the store, after new transactions were added.
 * Rules are idempotent: already linked transactions are skipped.
 *
 * @param {any} data whole store data (mutated)
 * @param {string[]} newIds ids of the transactions created by the current document
 * @returns {{ cardPayments: number, transfers: number, pendingCreated: number }}
 */
export function reconcile(data, newIds) {
  const created = new Set(newIds);
  const accountsById = new Map(data.accounts.map((account) => [account.id, account]));
  const summary = { cardPayments: 0, transfers: 0, pendingCreated: 0 };

  summary.cardPayments += matchCardPayments(data, accountsById, created);
  const transferResult = matchTransfers(data, accountsById, created);
  summary.transfers += transferResult.matched;
  summary.pendingCreated += transferResult.pending;
  summary.pendingCreated += flagOwnNameTransfers(data, created);
  summary.pendingCreated += flagUnmatchedCardPayments(data, accountsById, created);
  return summary;
}

/**
 * A debit in a checking account equal to a card invoice total, close to its due
 * date, is the invoice payment. The invoice purchases then get that cash date.
 */
function matchCardPayments(data, accountsById, created) {
  let matched = 0;
  const invoices = data.documents.filter((doc) => doc.type === 'card_invoice' && doc.totals?.totalCents > 0 && !doc.paymentTransactionId);
  for (const invoice of invoices) {
    const candidates = data.transactions.filter(
      (tx) =>
        tx.status === 'confirmed' &&
        tx.amountCents < 0 &&
        !tx.linkedTransactionId &&
        tx.nature !== 'card_payment' &&
        accountsById.get(tx.accountId)?.type !== 'credit_card' &&
        Math.abs(Math.abs(tx.amountCents) - invoice.totals.totalCents) <= 1 &&
        tx.date >= addDays(invoice.dueDate, -PAYMENT_WINDOW_BEFORE_DAYS) &&
        tx.date <= addDays(invoice.dueDate, PAYMENT_WINDOW_AFTER_DAYS) &&
        (created.has(tx.id) || created.has(invoice.id) || data.transactions.some((t) => created.has(t.id) && t.documentId === invoice.id)),
    );
    if (candidates.length !== 1) continue;
    const payment = candidates[0];
    payment.nature = 'card_payment';
    payment.categoryId = null;
    payment.linkedDocumentId = invoice.id;
    invoice.paymentTransactionId = payment.id;
    for (const tx of data.transactions) {
      if (tx.documentId === invoice.id && tx.status === 'confirmed') tx.cashDate = payment.date;
    }
    matched += 1;
  }
  return matched;
}

/**
 * Debit in account A and credit of the same amount in account B (same user)
 * within 3 business days. Investment accounts turn it into a contribution or a withdrawal.
 */
function matchTransfers(data, accountsById, created) {
  let matched = 0;
  let pending = 0;
  const open = (tx) =>
    tx.status === 'confirmed' &&
    !tx.linkedTransactionId &&
    (!NEUTRAL_NATURES.has(tx.nature) || (tx.nature === 'transfer' && tx.provisional === true));
  const debits = data.transactions.filter((tx) => open(tx) && tx.amountCents < 0 && accountsById.get(tx.accountId)?.type !== 'credit_card');

  for (const debit of debits) {
    const credits = data.transactions.filter(
      (tx) =>
        open(tx) &&
        tx.amountCents === -debit.amountCents &&
        tx.accountId !== debit.accountId &&
        accountsById.get(tx.accountId)?.type !== 'credit_card' &&
        (created.has(tx.id) || created.has(debit.id)) &&
        businessDaysBetween(debit.date, tx.date) <= TRANSFER_MAX_BUSINESS_DAYS,
    );
    if (credits.length === 0) continue;
    if (credits.length > 1) {
      if (!hasOpenPending(data, 'reconciliation_ambiguous', debit.id)) {
        data.pending.push(
          pendingItem('reconciliation_ambiguous', {
            transactionId: debit.id,
            message: 'Há mais de um crédito possível para esta saída. Qual deles é a outra ponta da transferência?',
            options: credits.map((credit) => ({ transactionId: credit.id, accountId: credit.accountId, date: credit.date })),
          }),
        );
        pending += 1;
      }
      continue;
    }
    const credit = credits[0];
    const fromType = accountsById.get(debit.accountId)?.type;
    const toType = accountsById.get(credit.accountId)?.type;
    let nature = 'transfer';
    if (toType === 'investment') nature = 'investment_contribution';
    else if (fromType === 'investment') nature = 'investment_withdrawal';
    for (const tx of [debit, credit]) {
      tx.nature = nature;
      tx.categoryId = null;
      tx.provisional = false;
    }
    debit.linkedTransactionId = credit.id;
    credit.linkedTransactionId = debit.id;
    resolvePendingFor(data, debit.id);
    resolvePendingFor(data, credit.id);
    matched += 1;
  }
  return { matched, pending };
}

/**
 * Pix or TED sent to the account holder's own name without the other side:
 * treated as a provisional transfer and asked to the user.
 */
function flagOwnNameTransfers(data, created) {
  const owner = normalizeText(data.profile?.ownerName ?? '');
  if (owner.length < 5) return 0;
  let pending = 0;
  for (const tx of data.transactions) {
    if (!created.has(tx.id) || tx.linkedTransactionId || NEUTRAL_NATURES.has(tx.nature)) continue;
    if (!isOwnName(owner, normalizeText(tx.payee || tx.description))) continue;
    tx.nature = 'transfer';
    tx.provisional = true;
    tx.categoryId = null;
    if (!hasOpenPending(data, 'own_transfer_unmatched', tx.id)) {
      data.pending.push(
        pendingItem('own_transfer_unmatched', {
          transactionId: tx.id,
          message:
            'Movimentação para o próprio titular sem a outra ponta registrada. Para qual conta foi (ou de qual veio)? Se foi um gasto, informe a categoria.',
        }),
      );
      pending += 1;
    }
  }
  return pending;
}

/**
 * Debits that look like an invoice payment but match no invoice.
 */
function flagUnmatchedCardPayments(data, accountsById, created) {
  let pending = 0;
  for (const tx of data.transactions) {
    if (!created.has(tx.id) || tx.amountCents >= 0 || tx.nature === 'card_payment') continue;
    if (accountsById.get(tx.accountId)?.type === 'credit_card') continue;
    if (!CARD_PAYMENT_HINT.test(normalizeText(`${tx.description} ${tx.payee ?? ''}`))) continue;
    if (hasOpenPending(data, 'card_payment_unmatched', tx.id)) continue;
    data.pending.push(
      pendingItem('card_payment_unmatched', {
        transactionId: tx.id,
        message:
          'Parece o pagamento de uma fatura de cartão, mas nenhuma fatura registrada tem esse valor. Registre a fatura ou informe se é pagamento parcial.',
      }),
    );
    pending += 1;
  }
  return pending;
}

/**
 * Banks truncate names (e.g. "MARIA DA SILVA SAN" for "MARIA DA SILVA SANTOS").
 * @param {string} owner normalized full name
 * @param {string} counterpart normalized counterpart name
 */
export function isOwnName(owner, counterpart) {
  if (counterpart.length < 10) return false;
  return owner.startsWith(counterpart) || counterpart.startsWith(owner);
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} fields
 */
export function pendingItem(type, fields) {
  return { id: newId('pend'), type, status: 'open', createdAt: new Date().toISOString(), ...fields };
}

function hasOpenPending(data, type, transactionId) {
  return data.pending.some((item) => item.status === 'open' && item.type === type && item.transactionId === transactionId);
}

function resolvePendingFor(data, transactionId) {
  for (const item of data.pending) {
    if (item.status === 'open' && item.transactionId === transactionId) {
      item.status = 'resolved';
      item.resolvedAt = new Date().toISOString();
      item.resolution = 'Conciliado automaticamente.';
    }
  }
}
