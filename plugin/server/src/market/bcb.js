/**
 * Banco Central do Brasil public APIs (no authentication required).
 * - SGS time series: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{code}/dados
 * - Focus market expectations (Olinda OData)
 */

const SGS_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const FOCUS_BASE = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata';

/** SGS series used by the agent. Codes are documented in the BCB SGS catalog. */
export const SGS_SERIES = {
  selic_target: { code: 432, label: 'Meta Selic (% a.a.)' },
  cdi_daily: { code: 12, label: 'CDI diário (% a.d.)' },
  ipca_monthly: { code: 433, label: 'IPCA mensal (%)' },
  igpm_monthly: { code: 189, label: 'IGP-M mensal (%)' },
  usd_brl: { code: 1, label: 'Dólar PTAX venda (R$)' },
};

/**
 * Parses an SGS response ([{ data: 'dd/mm/yyyy', valor: '10.50' }]).
 * @param {Array<{ data: string, valor: string }>} payload
 * @returns {Array<{ date: string, value: number }>}
 */
export function parseSgs(payload) {
  if (!Array.isArray(payload)) throw new Error('Unexpected SGS payload');
  return payload
    .map((item) => {
      const [d, m, y] = String(item.data).split('/');
      return { date: `${y}-${m}-${d}`, value: Number(String(item.valor).replace(',', '.')) };
    })
    .filter((item) => Number.isFinite(item.value));
}

/**
 * Compounds periodic percentage rates: [1, 1] -> 2.01 (%).
 * @param {number[]} percents
 */
export function compoundPercent(percents) {
  return (percents.reduce((acc, value) => acc * (1 + value / 100), 1) - 1) * 100;
}

/**
 * Parses a Focus annual expectations response, keeping the most recent median per reference year.
 * @param {{ value: Array<{ Indicador: string, Data: string, DataReferencia: string, Mediana: number }> }} payload
 * @returns {Record<string, { value: number, date: string }>}
 */
export function parseFocus(payload) {
  const rows = Array.isArray(payload?.value) ? payload.value : [];
  const latest = {};
  for (const row of rows) {
    const key = String(row.DataReferencia);
    if (!latest[key] || row.Data > latest[key].date) latest[key] = { value: Number(row.Mediana), date: row.Data };
  }
  return latest;
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {number} code
 * @param {string} startIso
 * @param {string} endIso
 */
export async function fetchSgs(fetchImpl, code, startIso, endIso) {
  const url = `${SGS_BASE}.${code}/dados?formato=json&dataInicial=${toBr(startIso)}&dataFinal=${toBr(endIso)}`;
  return parseSgs(await getJson(fetchImpl, url));
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {'Selic'|'IPCA'|'Câmbio'} indicator
 */
export async function fetchFocusAnnual(fetchImpl, indicator) {
  const filter = encodeURIComponent(`Indicador eq '${indicator}' and baseCalculo eq 0`);
  const url = `${FOCUS_BASE}/ExpectativasMercadoAnuais?$top=40&$filter=${filter}&$orderby=Data%20desc&$format=json&$select=Indicador,Data,DataReferencia,Mediana`;
  return parseFocus(await getJson(fetchImpl, url));
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
  return response.json();
}

function toBr(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
