import { monthOf, shiftMonth } from '../lib/dates.js';
import { NEUTRAL_NATURES } from './reconciliation.js';

/**
 * True for confirmed income or expense transactions (the ones that make up the cash flow).
 * @param {any} tx
 */
export function isFlow(tx) {
  return tx.status === 'confirmed' && !NEUTRAL_NATURES.has(tx.nature);
}

/**
 * Cash flow grouped by month and category.
 * - competence: by the date the fact happened (purchase date)
 * - cash: by the date money left or entered the account (invoice payment date for cards)
 *
 * @param {any} data
 * @param {{ fromMonth: string, toMonth: string, view: 'competence'|'cash' }} options
 */
export function cashFlow(data, { fromMonth, toMonth, view }) {
  const categories = new Map(data.categories.map((category) => [category.id, category]));
  const months = listMonths(fromMonth, toMonth);
  const byMonth = Object.fromEntries(months.map((month) => [month, { incomeCents: 0, expenseCents: 0, byCategory: {} }]));

  for (const tx of data.transactions) {
    if (!isFlow(tx)) continue;
    const month = monthOf(view === 'cash' ? tx.cashDate : tx.date);
    const bucket = byMonth[month];
    if (!bucket) continue;
    if (tx.amountCents >= 0) bucket.incomeCents += tx.amountCents;
    else bucket.expenseCents += tx.amountCents;
    const category = categories.get(tx.categoryId);
    const label = category ? `${category.group} > ${category.name}` : 'Sem categoria';
    bucket.byCategory[label] = (bucket.byCategory[label] ?? 0) + tx.amountCents;
  }

  return months.map((month) => ({
    month,
    incomeCents: byMonth[month].incomeCents,
    expenseCents: byMonth[month].expenseCents,
    netCents: byMonth[month].incomeCents + byMonth[month].expenseCents,
    byCategory: Object.entries(byMonth[month].byCategory)
      .map(([category, amountCents]) => ({ category, amountCents }))
      .sort((a, b) => a.amountCents - b.amountCents),
  }));
}

/**
 * Future installments grouped by month (cash view).
 * @param {any} data
 * @param {string} fromMonth
 * @param {number} months
 */
export function commitments(data, fromMonth, months = 12) {
  const range = listMonths(fromMonth, shiftMonth(fromMonth, months - 1));
  const result = Object.fromEntries(range.map((month) => [month, { totalCents: 0, items: [] }]));
  for (const tx of data.transactions) {
    if (tx.status !== 'forecast') continue;
    const month = monthOf(tx.cashDate);
    if (!result[month]) continue;
    result[month].totalCents += tx.amountCents;
    result[month].items.push({
      description: tx.payee ?? tx.description,
      installment: tx.installment ? `${tx.installment.number}/${tx.installment.total}` : null,
      amountCents: tx.amountCents,
    });
  }
  return range.map((month) => ({ month, ...result[month] }));
}

/**
 * Share of each category in the month total, in basis points (1/100 of a percent),
 * computed in integers. Largest amounts first.
 * @param {Array<{ category: string, amountCents: number }>} items
 * @param {number} totalCents
 */
function breakdown(items, totalCents) {
  const total = Math.abs(totalCents);
  return items
    .map((item) => ({
      category: item.category,
      amountCents: item.amountCents,
      shareBps: total === 0 ? 0 : Math.round((Math.abs(item.amountCents) * 10_000) / total),
    }))
    .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents));
}

/**
 * Month summary with category deviations against the average of the previous months.
 * @param {any} data
 * @param {string} month
 * @param {number} [lookback]
 */
export function monthSummary(data, month, lookback = 6) {
  const history = cashFlow(data, { fromMonth: shiftMonth(month, -lookback), toMonth: month, view: 'competence' });
  const current = history[history.length - 1];
  const previous = history.slice(0, -1).filter((item) => item.incomeCents !== 0 || item.expenseCents !== 0);
  const averages = {};
  for (const item of previous) {
    for (const { category, amountCents } of item.byCategory) averages[category] = (averages[category] ?? 0) + amountCents;
  }
  const divisor = Math.max(previous.length, 1);
  const deviations = current.byCategory
    .filter((item) => item.amountCents < 0)
    .map((item) => {
      const averageCents = Math.round((averages[item.category] ?? 0) / divisor);
      const variation = averageCents === 0 ? null : (item.amountCents - averageCents) / Math.abs(averageCents);
      return { category: item.category, amountCents: item.amountCents, averageCents, variation };
    })
    .sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0));

  const cash = cashFlow(data, { fromMonth: month, toMonth: month, view: 'cash' })[0];
  const debtCostCents = data.transactions
    .filter((tx) => tx.status === 'confirmed' && tx.debtCost && monthOf(tx.date) === month)
    .reduce((acc, tx) => acc + tx.amountCents, 0);

  return {
    month,
    competence: { incomeCents: current.incomeCents, expenseCents: current.expenseCents, netCents: current.netCents },
    income: breakdown(current.byCategory.filter((item) => item.amountCents > 0), current.incomeCents),
    expenses: breakdown(current.byCategory.filter((item) => item.amountCents < 0), current.expenseCents),
    cash: { incomeCents: cash.incomeCents, expenseCents: cash.expenseCents, netCents: cash.netCents },
    monthsInAverage: previous.length,
    deviations,
    debtCostCents,
    uncategorizedCount: data.transactions.filter((tx) => isFlow(tx) && !tx.categoryId && monthOf(tx.date) === month).length,
  };
}

/**
 * Average monthly expense (cash view) over the last `months` months before `month`.
 * @param {any} data
 * @param {string} month
 * @param {number} months
 */
export function averageMonthlyExpense(data, month, months = 6) {
  const flow = cashFlow(data, { fromMonth: shiftMonth(month, -months + 1), toMonth: month, view: 'cash' }).filter(
    (item) => item.expenseCents !== 0,
  );
  if (flow.length === 0) return 0;
  return Math.round(-flow.reduce((acc, item) => acc + item.expenseCents, 0) / flow.length);
}

/**
 * @param {string} from
 * @param {string} to
 */
export function listMonths(from, to) {
  const months = [];
  for (let cursor = from; cursor <= to; cursor = shiftMonth(cursor, 1)) months.push(cursor);
  return months;
}
