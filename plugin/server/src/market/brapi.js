/**
 * brapi.dev quotes for B3 tickers (stocks, FIIs, ETFs and indexes such as ^BVSP).
 * A free token from brapi.dev is required for most tickers.
 */

const BASE = 'https://brapi.dev/api/quote';

/**
 * @param {{ results?: Array<{ symbol: string, regularMarketPrice: number, regularMarketChangePercent?: number, regularMarketTime?: string }> }} payload
 * @returns {Record<string, { price: number, changePercent: number|null, time: string|null }>}
 */
export function parseQuotes(payload) {
  const quotes = {};
  for (const item of payload?.results ?? []) {
    if (typeof item.regularMarketPrice !== 'number') continue;
    quotes[item.symbol] = {
      price: item.regularMarketPrice,
      changePercent: typeof item.regularMarketChangePercent === 'number' ? item.regularMarketChangePercent : null,
      time: item.regularMarketTime ?? null,
    };
  }
  return quotes;
}

/**
 * Fetches quotes one ticker at a time (the free plan limits batch requests).
 * @param {typeof fetch} fetchImpl
 * @param {string[]} tickers
 * @param {string} token
 */
export async function fetchQuotes(fetchImpl, tickers, token) {
  const quotes = {};
  const errors = [];
  for (const ticker of tickers) {
    try {
      const url = `${BASE}/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      Object.assign(quotes, parseQuotes(await response.json()));
    } catch (error) {
      errors.push(`${ticker}: ${error.message}`);
    }
  }
  return { quotes, errors };
}
