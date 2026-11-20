import { addMonths, diffDays } from '../lib/dates.js';
import { newId } from '../lib/text.js';

const AMOUNT_TOLERANCE_CENTS = 5;
const DATE_WINDOW_DAYS = 45;

/**
 * Tries to find the forecast created earlier for this installment.
 * @param {any[]} transactions existing transactions
 * @param {{ accountId: string, payeeKey: string, amountCents: number, date: string, installment: { number: number, total: number } }} line
 */
export function findForecastFor(transactions, line) {
  return transactions.find(
    (tx) =>
      tx.status === 'forecast' &&
      tx.accountId === line.accountId &&
      tx.installment &&
      tx.installment.total === line.installment.total &&
      tx.installment.number === line.installment.number &&
      tx.payeeKey === line.payeeKey &&
      Math.abs(tx.amountCents - line.amountCents) <= AMOUNT_TOLERANCE_CENTS &&
      Math.abs(diffDays(tx.date, line.date)) <= DATE_WINDOW_DAYS,
  );
}

/**
 * Builds the forecasts for the remaining installments of a purchase.
 * @param {any} confirmed the confirmed installment transaction
 * @param {string|null} dueDate invoice due date used as the forecast cash date base
 * @returns {any[]}
 */
export function buildForecasts(confirmed, dueDate) {
  const { number, total, groupId } = confirmed.installment;
  const forecasts = [];
  for (let next = number + 1; next <= total; next += 1) {
    const offset = next - number;
    forecasts.push({
      ...confirmed,
      id: newId('tx'),
      documentId: null,
      dedupKey: null,
      balanceAfterCents: null,
      status: 'forecast',
      date: addMonths(confirmed.date, offset),
      cashDate: addMonths(dueDate ?? confirmed.cashDate ?? confirmed.date, offset),
      installment: { number: next, total, groupId },
      createdAt: new Date().toISOString(),
    });
  }
  return forecasts;
}

/**
 * Cancels the remaining forecasts of an installment group (prepayment, refund or payoff).
 * @param {any[]} transactions
 * @param {string} groupId
 * @returns {number} number of cancelled forecasts
 */
export function cancelRemainingForecasts(transactions, groupId) {
  let cancelled = 0;
  for (const tx of transactions) {
    if (tx.status === 'forecast' && tx.installment?.groupId === groupId) {
      tx.status = 'cancelled';
      cancelled += 1;
    }
  }
  return cancelled;
}

/**
 * @returns {string}
 */
export function newInstallmentGroupId() {
  return newId('inst');
}
