import { sumCents, formatBRL } from '../lib/money.js';

/** Default tolerance in cents when comparing extracted totals with declared totals. */
export const DEFAULT_TOLERANCE_CENTS = 1;

/**
 * Card invoice line types and whether they count towards the invoice total.
 * "previous_balance" and "previous_payment" are handled by the formula itself.
 */
const INVOICE_CHARGE_TYPES = new Set(['purchase', 'refund', 'fee', 'interest', 'iof', 'annual_fee', 'financing', 'other']);

/**
 * Validates a bank statement against the totals printed on the document.
 * Checks (when the data is available):
 *  1. opening + sum(amounts) = closing
 *  2. sum(positive) = inflows and sum(negative) = -outflows
 *  3. running balance chain, which pinpoints the exact line that breaks
 *
 * @param {{ openingBalanceCents: number, closingBalanceCents: number, inflowsCents?: number|null, outflowsCents?: number|null }} totals
 * @param {Array<{ amountCents: number, balanceAfterCents?: number|null, date: string, description: string }>} lines
 *        lines in chronological order
 * @param {number} [toleranceCents]
 */
export function validateBankStatement(totals, lines, toleranceCents = DEFAULT_TOLERANCE_CENTS) {
  const checks = [];
  const net = sumCents(lines.map((line) => line.amountCents));
  checks.push(
    compare(
      'saldo_inicial_mais_movimentos',
      'Saldo inicial + movimentos = saldo final',
      totals.openingBalanceCents + net,
      totals.closingBalanceCents,
      toleranceCents,
    ),
  );

  if (isNumber(totals.inflowsCents)) {
    const inflows = sumCents(lines.filter((l) => l.amountCents > 0).map((l) => l.amountCents));
    checks.push(compare('entradas', 'Soma das entradas = total de entradas', inflows, totals.inflowsCents, toleranceCents));
  }
  if (isNumber(totals.outflowsCents)) {
    const outflows = -sumCents(lines.filter((l) => l.amountCents < 0).map((l) => l.amountCents));
    checks.push(compare('saidas', 'Soma das saídas = total de saídas', outflows, Math.abs(totals.outflowsCents), toleranceCents));
  }

  if (lines.length > 0 && lines.every((line) => isNumber(line.balanceAfterCents))) {
    let previous = totals.openingBalanceCents;
    let brokenAt = null;
    for (let index = 0; index < lines.length; index += 1) {
      const expected = previous + lines[index].amountCents;
      if (Math.abs(expected - lines[index].balanceAfterCents) > toleranceCents) {
        brokenAt = { index, line: lines[index], expectedBalanceCents: expected };
        break;
      }
      previous = lines[index].balanceAfterCents;
    }
    checks.push({
      key: 'cadeia_de_saldos',
      label: 'Saldo de cada linha fecha com a linha anterior',
      ok: brokenAt === null,
      detail:
        brokenAt === null
          ? undefined
          : `A cadeia quebra na linha ${brokenAt.index + 1} (${brokenAt.line.date}, ${brokenAt.line.description}): ` +
            `saldo esperado ${formatBRL(brokenAt.expectedBalanceCents)}, impresso ${formatBRL(brokenAt.line.balanceAfterCents)}. ` +
            'Verifique se falta uma linha antes dela ou se o sinal do valor está invertido.',
    });
  }

  return summarize(checks);
}

/**
 * Validates a credit card invoice.
 * Formula: previous balance + previous payment (negative) + sum(charges) = invoice total.
 * Lines of type "previous_balance" and "previous_payment" are taken from the totals,
 * not summed twice.
 *
 * @param {{ totalCents: number, previousBalanceCents?: number|null, previousPaymentCents?: number|null }} totals
 * @param {Array<{ amountCents: number, lineType?: string }>} lines
 * @param {number} [toleranceCents]
 */
export function validateCardInvoice(totals, lines, toleranceCents = DEFAULT_TOLERANCE_CENTS) {
  const charges = sumCents(
    lines.filter((line) => INVOICE_CHARGE_TYPES.has(line.lineType ?? 'purchase')).map((line) => line.amountCents),
  );
  const previousBalance = totals.previousBalanceCents ?? 0;
  const previousPayment = totals.previousPaymentCents ?? 0;
  const computed = previousBalance + previousPayment + charges;
  const checks = [
    compare('total_da_fatura', 'Fatura anterior + pagamento + lançamentos = total da fatura', computed, totals.totalCents, toleranceCents),
  ];
  return summarize(checks);
}

/**
 * Validates an investment statement, position by position and in total.
 * @param {{ openingTotalCents?: number|null, closingTotalCents?: number|null }} totals
 * @param {Array<{ asset: string, openingCents: number, contributionsCents: number, withdrawalsCents: number, incomeCents: number, taxesAndFeesCents: number, closingCents: number }>} positions
 * @param {number} [toleranceCents]
 */
export function validateInvestmentStatement(totals, positions, toleranceCents = DEFAULT_TOLERANCE_CENTS) {
  const checks = positions.map((position) =>
    compare(
      `posicao:${position.asset}`,
      `Movimentação fecha para ${position.asset}`,
      position.openingCents + position.contributionsCents - position.withdrawalsCents + position.incomeCents - position.taxesAndFeesCents,
      position.closingCents,
      toleranceCents,
    ),
  );
  if (isNumber(totals.closingTotalCents)) {
    checks.push(
      compare(
        'saldo_total',
        'Soma das posições = saldo total',
        sumCents(positions.map((position) => position.closingCents)),
        totals.closingTotalCents,
        toleranceCents,
      ),
    );
  }
  return summarize(checks);
}

function compare(key, label, actual, expected, toleranceCents) {
  const difference = actual - expected;
  const ok = Math.abs(difference) <= toleranceCents;
  return {
    key,
    label,
    ok,
    actualCents: actual,
    expectedCents: expected,
    differenceCents: difference,
    detail: ok
      ? undefined
      : `Calculado ${formatBRL(actual)}, documento informa ${formatBRL(expected)} (diferença de ${formatBRL(difference)}).`,
  };
}

function summarize(checks) {
  return { ok: checks.every((check) => check.ok), checks };
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
