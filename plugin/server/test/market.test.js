import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSgs, parseFocus, compoundPercent } from '../src/market/bcb.js';
import { parseQuotes } from '../src/market/brapi.js';
import { updateMarketData } from '../src/market/market-service.js';
import { createTestStore } from './helpers.js';

test('parseSgs converts Brazilian dates and decimal values', () => {
  assert.deepEqual(parseSgs([{ data: '19/11/2026', valor: '0.055131' }]), [{ date: '2026-11-19', value: 0.055131 }]);
});

test('compoundPercent compounds monthly rates', () => {
  assert.ok(Math.abs(compoundPercent([1, 1]) - 2.01) < 1e-9);
});

test('parseFocus keeps the latest median per reference year', () => {
  const parsed = parseFocus({
    value: [
      { Indicador: 'Selic', Data: '2026-11-07', DataReferencia: '2026', Mediana: 14.75 },
      { Indicador: 'Selic', Data: '2026-11-14', DataReferencia: '2026', Mediana: 14.5 },
      { Indicador: 'Selic', Data: '2026-11-14', DataReferencia: '2027', Mediana: 12.25 },
    ],
  });
  assert.deepEqual(parsed['2026'], { value: 14.5, date: '2026-11-14' });
  assert.equal(parsed['2027'].value, 12.25);
});

test('parseQuotes reads brapi results', () => {
  const quotes = parseQuotes({ results: [{ symbol: 'PETR4', regularMarketPrice: 38.5, regularMarketChangePercent: -1.2 }] });
  assert.deepEqual(quotes.PETR4, { price: 38.5, changePercent: -1.2, time: null });
});

test('updateMarketData stores what succeeded and reports failures', async () => {
  const store = createTestStore();
  const fakeFetch = async (url) => {
    if (url.includes('sgs.432')) return json([{ data: '01/11/2026', valor: '14.25' }]);
    if (url.includes('sgs.12/')) return json([{ data: '18/11/2026', valor: '0.05' }, { data: '19/11/2026', valor: '0.05' }]);
    if (url.includes('Expectativas')) return json({ value: [{ Indicador: 'Selic', Data: '2026-11-14', DataReferencia: '2026', Mediana: 14.5 }] });
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const result = await updateMarketData(store, { fetchImpl: fakeFetch, todayIso: '2026-11-20' });
  assert.ok(result.updatedIndicators.includes('selic_target'));
  assert.ok(result.updatedIndicators.includes('cdi_12m'));
  assert.ok(result.updatedIndicators.includes('focus_selic_current_year'));
  assert.ok(result.errors.some((error) => error.startsWith('IPCA')));
  assert.equal(store.get('market').indicators.selic_target.value, 14.25);
});

function json(body) {
  return { ok: true, status: 200, json: async () => body };
}
