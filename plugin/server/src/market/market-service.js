import { addDays, today } from '../lib/dates.js';
import { SGS_SERIES, compoundPercent, fetchFocusAnnual, fetchSgs } from './bcb.js';
import { fetchQuotes } from './brapi.js';

/**
 * Refreshes the market snapshot kept in the store. Each source is independent:
 * a failure in one is reported and does not stop the others.
 *
 * @param {import('../storage/store.js').Store} store
 * @param {{ fetchImpl?: typeof fetch, todayIso?: string }} [options]
 */
export async function updateMarketData(store, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.todayIso ?? today();
  const yearAgo = addDays(now, -366);
  const indicators = {};
  const errors = [];

  await attempt(errors, 'Selic', async () => {
    const rows = await fetchSgs(fetchImpl, SGS_SERIES.selic_target.code, addDays(now, -60), now);
    const last = rows.at(-1);
    if (last) indicators.selic_target = { value: last.value, date: last.date, label: SGS_SERIES.selic_target.label };
  });

  await attempt(errors, 'CDI', async () => {
    const rows = await fetchSgs(fetchImpl, SGS_SERIES.cdi_daily.code, yearAgo, now);
    if (rows.length > 0) {
      indicators.cdi_12m = { value: round(compoundPercent(rows.map((row) => row.value))), date: rows.at(-1).date, label: 'CDI acumulado 12 meses (%)' };
    }
  });

  await attempt(errors, 'IPCA', async () => {
    const rows = await fetchSgs(fetchImpl, SGS_SERIES.ipca_monthly.code, addDays(now, -400), now);
    const last12 = rows.slice(-12);
    if (last12.length > 0) {
      indicators.ipca_month = { value: last12.at(-1).value, date: last12.at(-1).date, label: SGS_SERIES.ipca_monthly.label };
      indicators.ipca_12m = { value: round(compoundPercent(last12.map((row) => row.value))), date: last12.at(-1).date, label: 'IPCA acumulado 12 meses (%)' };
    }
  });

  await attempt(errors, 'IGP-M', async () => {
    const rows = await fetchSgs(fetchImpl, SGS_SERIES.igpm_monthly.code, addDays(now, -400), now);
    const last12 = rows.slice(-12);
    if (last12.length > 0) {
      indicators.igpm_12m = { value: round(compoundPercent(last12.map((row) => row.value))), date: last12.at(-1).date, label: 'IGP-M acumulado 12 meses (%)' };
    }
  });

  await attempt(errors, 'Dólar', async () => {
    const rows = await fetchSgs(fetchImpl, SGS_SERIES.usd_brl.code, addDays(now, -15), now);
    const last = rows.at(-1);
    if (last) indicators.usd_brl = { value: last.value, date: last.date, label: SGS_SERIES.usd_brl.label };
  });

  const year = Number(now.slice(0, 4));
  for (const [indicator, prefix] of [
    ['Selic', 'focus_selic'],
    ['IPCA', 'focus_ipca'],
    ['Câmbio', 'focus_usd'],
  ]) {
    await attempt(errors, `Focus ${indicator}`, async () => {
      const byYear = await fetchFocusAnnual(fetchImpl, indicator);
      for (const [key, offset] of [
        ['current_year', 0],
        ['next_year', 1],
      ]) {
        const entry = byYear[String(year + offset)];
        if (entry) indicators[`${prefix}_${key}`] = { value: entry.value, date: entry.date, label: `Focus ${indicator} ${year + offset} (mediana)` };
      }
    });
  }

  const token = store.get('profile')?.brapiToken;
  let quotes = {};
  const tickers = [...new Set(store.get('assets').map((asset) => asset.ticker).filter(Boolean))];
  if (token && tickers.length > 0) {
    const fetched = await fetchQuotes(fetchImpl, [...tickers, '^BVSP'], token);
    quotes = fetched.quotes;
    errors.push(...fetched.errors.map((message) => `Cotação ${message}`));
  }

  store.transact((data) => {
    data.market = {
      indicators: { ...(data.market?.indicators ?? {}), ...indicators },
      quotes: { ...(data.market?.quotes ?? {}), ...quotes },
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    updatedIndicators: Object.keys(indicators),
    updatedQuotes: Object.keys(quotes),
    errors,
    notes: token ? [] : ['Cotações de ações e FIIs exigem um token gratuito da brapi.dev (update_profile, campo brapi_token).'],
  };
}

async function attempt(errors, label, task) {
  try {
    await task();
  } catch (error) {
    errors.push(`${label}: ${error.message}`);
  }
}

const round = (value) => Math.round(value * 100) / 100;
