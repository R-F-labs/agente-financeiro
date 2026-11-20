import { diffDays, monthRange, shiftMonth } from '../lib/dates.js';
import { cashFlow, commitments, monthSummary, averageMonthlyExpense } from './reports.js';
import { portfolioSnapshot, latestPositionsMonth } from './portfolio.js';
import { annualToMonthly, fixedIncomeTaxRate, requiredMonthlyContribution } from './finance.js';

/** Conservative fallback when no market expectation is stored yet. */
const FALLBACK_ANNUAL_RATE = 0.1;

/**
 * Builds the monthly package: every number the analyst needs, already computed.
 * The assistant must not recompute these values, only interpret them.
 *
 * @param {any} data
 * @param {string} month YYYY-MM
 * @param {string} todayIso
 */
export function buildMonthlyPackage(data, month, todayIso) {
  const { end } = monthRange(month);
  const flow12 = cashFlow(data, { fromMonth: shiftMonth(month, -11), toMonth: month, view: 'cash' });
  const nonEmpty = flow12.filter((item) => item.incomeCents !== 0 || item.expenseCents !== 0);
  const avg = (count, field) => {
    const slice = nonEmpty.slice(-count);
    return slice.length === 0 ? 0 : Math.round(slice.reduce((acc, item) => acc + item[field], 0) / slice.length);
  };

  const summary = monthSummary(data, month);
  const upcoming = commitments(data, shiftMonth(month, 1), 12);
  const portfolioMonth = latestPositionsMonth(data) && latestPositionsMonth(data) <= month ? latestPositionsMonth(data) : null;
  const portfolio = portfolioMonth ? portfolioSnapshot(data, portfolioMonth) : null;
  const averageExpense = averageMonthlyExpense(data, month, 6);
  const market = data.market ?? { indicators: {} };
  const annualRate = pickExpectedAnnualRate(market);
  const monthlyGross = annualToMonthly(annualRate);

  const goals = (data.goals ?? [])
    .filter((goal) => goal.active !== false)
    .sort((a, b) => a.priority - b.priority)
    .map((goal) => {
      const months = Math.max(0, Math.round(diffDays(end, goal.deadline) / 30.4375));
      const taxRate = fixedIncomeTaxRate(Math.max(0, diffDays(end, goal.deadline)));
      const monthlyNet = monthlyGross * (1 - taxRate);
      const presentCents = goal.currentCents ?? 0;
      return {
        name: goal.name,
        priority: goal.priority,
        targetCents: goal.targetCents,
        presentCents,
        deadline: goal.deadline,
        monthsLeft: months,
        requiredMonthlyCents: requiredMonthlyContribution({ present: presentCents, target: goal.targetCents, months, monthlyRate: monthlyNet }),
        assumedNetMonthlyRate: round6(monthlyNet),
      };
    });

  const nextMonthCommitments = upcoming[0]?.totalCents ?? 0;
  const monthCash = summary.cash.netCents;
  const profile = data.profile ?? {};
  const reserveMonths = averageExpense > 0 && portfolio ? portfolio.liquidCents / averageExpense : null;

  const recentDecisions = (data.decisions ?? [])
    .filter((decision) => decision.month >= shiftMonth(month, -3) && decision.month < month)
    .map((decision) => ({ month: decision.month, action: decision.action, status: decision.status, note: decision.note ?? null }));

  return {
    month,
    generatedAt: new Date().toISOString(),
    asOf: todayIso,
    profile: {
      riskTolerance: profile.riskTolerance ?? null,
      horizonYears: profile.horizonYears ?? null,
      emergencyMonthsTarget: profile.emergencyMonthsTarget ?? null,
      restrictions: profile.restrictions ?? null,
    },
    cashFlow: {
      monthIncomeCents: summary.cash.incomeCents,
      monthExpenseCents: summary.cash.expenseCents,
      monthNetCents: monthCash,
      average3mNetCents: avg(3, 'netCents'),
      average6mNetCents: avg(6, 'netCents'),
      average12mNetCents: avg(12, 'netCents'),
      last12Months: flow12.map(({ month: m, incomeCents, expenseCents, netCents }) => ({ month: m, incomeCents, expenseCents, netCents })),
    },
    competence: {
      monthExpenseCents: summary.competence.expenseCents,
      topDeviations: summary.deviations.slice(0, 5),
      debtCostCents: summary.debtCostCents,
      uncategorizedCount: summary.uncategorizedCount,
    },
    commitments: upcoming.map(({ month: m, totalCents }) => ({ month: m, totalCents })),
    reserve: {
      liquidCents: portfolio?.liquidCents ?? null,
      averageMonthlyExpenseCents: averageExpense,
      monthsCovered: reserveMonths === null ? null : round2(reserveMonths),
      targetMonths: profile.emergencyMonthsTarget ?? null,
    },
    goals,
    portfolio: portfolio
      ? {
          month: portfolio.month,
          totalCents: portfolio.totalCents,
          assets: portfolio.assets.map((asset) => ({
            name: asset.name,
            assetClass: asset.assetClass,
            indexer: asset.indexer,
            contractedRate: asset.contractedRate,
            maturityDate: asset.maturityDate,
            liquidity: asset.liquidity,
            closingCents: asset.closingCents,
            share: round4(asset.share),
            returnMonth: asset.returnMonth === null ? null : round6(asset.returnMonth),
            return12m: asset.return12m === null ? null : round6(asset.return12m),
            monthsWithData: asset.monthsWithData,
            benchmark: asset.benchmark,
            benchmark12m: benchmarkReturn(market, asset.benchmark),
          })),
          concentrationByClass: portfolio.concentrationByClass.map((item) => ({ ...item, share: round4(item.share) })),
        }
      : null,
    market: {
      updatedAt: market.updatedAt ?? null,
      indicators: market.indicators ?? {},
      assumedAnnualRateForGoals: annualRate,
    },
    availableForInvestmentCents: monthCash + nextMonthCommitments,
    recentDecisions,
    dataGaps: dataGaps(data, month, portfolio),
  };
}

function pickExpectedAnnualRate(market) {
  const indicators = market.indicators ?? {};
  const focusSelic = indicators.focus_selic_current_year?.value;
  if (typeof focusSelic === 'number') return focusSelic / 100;
  const selic = indicators.selic_target?.value;
  if (typeof selic === 'number') return selic / 100;
  return FALLBACK_ANNUAL_RATE;
}

function benchmarkReturn(market, benchmark) {
  const indicators = market.indicators ?? {};
  if (benchmark === 'CDI' && typeof indicators.cdi_12m?.value === 'number') return round6(indicators.cdi_12m.value / 100);
  if (benchmark === 'IPCA' && typeof indicators.ipca_12m?.value === 'number') return round6(indicators.ipca_12m.value / 100);
  return null;
}

function dataGaps(data, month, portfolio) {
  const gaps = [];
  const { start, end } = monthRange(month);
  for (const account of data.accounts.filter((item) => item.active !== false && item.expectsMonthlyDocument !== false)) {
    const covered = data.documents.some((doc) => doc.accountId === account.id && doc.periodStart <= end && doc.periodEnd >= start);
    if (!covered) gaps.push(`Nenhum documento de ${account.nickname} cobre ${month}.`);
  }
  if (!data.profile) gaps.push('Perfil do investidor não preenchido.');
  if (!portfolio) gaps.push('Nenhum extrato de investimentos registrado até este mês.');
  if (!data.market?.updatedAt) gaps.push('Dados de mercado nunca foram atualizados (use update_market_data).');
  const openPending = data.pending.filter((item) => item.status === 'open').length;
  if (openPending > 0) gaps.push(`${openPending} pendência(s) em aberto podem distorcer os números.`);
  return gaps;
}

const round2 = (value) => Math.round(value * 100) / 100;
const round4 = (value) => Math.round(value * 10_000) / 10_000;
const round6 = (value) => Math.round(value * 1_000_000) / 1_000_000;
