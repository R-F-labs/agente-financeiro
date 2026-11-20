import { shiftMonth } from '../lib/dates.js';
import { chainReturns, periodReturn } from './finance.js';

/** Benchmark used to judge each asset class. */
export const BENCHMARK_BY_CLASS = {
  tesouro_selic: 'CDI',
  rf_pos_cdi: 'CDI',
  poupanca: 'CDI',
  fundo: 'CDI',
  tesouro_ipca: 'IPCA',
  rf_ipca: 'IPCA',
  tesouro_prefixado: 'PRE',
  rf_prefixado: 'PRE',
  acao: 'IBOV',
  etf: 'IBOV',
  fii: 'IFIX',
};

/** Classes considered liquid (usable as emergency reserve) when liquidity is daily. */
const DAILY_LIQUIDITY = new Set(['diaria', 'daily', 'D+0', 'D+1']);

/**
 * Portfolio snapshot for a month with returns over the month and the last 12 months.
 * @param {any} data
 * @param {string} month
 */
export function portfolioSnapshot(data, month) {
  const assets = new Map(data.assets.map((asset) => [asset.id, asset]));
  const current = data.positions.filter((position) => position.month === month);
  const totalCents = current.reduce((acc, position) => acc + position.closingCents, 0);

  const rows = current.map((position) => {
    const asset = assets.get(position.assetId) ?? {};
    const history = [];
    for (let i = 11; i >= 0; i -= 1) {
      const target = shiftMonth(month, -i);
      const found = data.positions.find((item) => item.assetId === position.assetId && item.month === target);
      history.push(found ? periodReturn(found) : null);
    }
    const monthsWithData = history.filter((value) => typeof value === 'number').length;
    return {
      assetId: position.assetId,
      name: asset.name,
      assetClass: asset.assetClass,
      indexer: asset.indexer,
      contractedRate: asset.contractedRate,
      maturityDate: asset.maturityDate,
      liquidity: asset.liquidity,
      benchmark: BENCHMARK_BY_CLASS[asset.assetClass] ?? null,
      closingCents: position.closingCents,
      share: totalCents > 0 ? position.closingCents / totalCents : 0,
      returnMonth: periodReturn(position),
      return12m: chainReturns(history),
      monthsWithData,
    };
  });

  const byClass = {};
  for (const row of rows) {
    const key = row.assetClass ?? 'nao_classificado';
    byClass[key] = (byClass[key] ?? 0) + row.closingCents;
  }

  return {
    month,
    totalCents,
    liquidCents: rows.filter((row) => DAILY_LIQUIDITY.has(row.liquidity ?? '')).reduce((acc, row) => acc + row.closingCents, 0),
    assets: rows.sort((a, b) => b.closingCents - a.closingCents),
    concentrationByClass: Object.entries(byClass).map(([assetClass, cents]) => ({
      assetClass,
      totalCents: cents,
      share: totalCents > 0 ? cents / totalCents : 0,
    })),
  };
}

/**
 * Latest month with positions registered, or null.
 * @param {any} data
 */
export function latestPositionsMonth(data) {
  return data.positions.reduce((latest, position) => (latest === null || position.month > latest ? position.month : latest), null);
}
