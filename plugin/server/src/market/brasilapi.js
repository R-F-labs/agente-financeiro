/**
 * BrasilAPI public company registry (data from the Receita Federal, no authentication).
 * https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 * Only company ids (CNPJ) are sent. CPFs are never sent to any service.
 */

const CNPJ_BASE = 'https://brasilapi.com.br/api/cnpj/v1';
const TIMEOUT_MS = 8000;

/**
 * @param {any} payload
 * @param {string} cnpj
 */
export function parseCompany(payload, cnpj) {
  if (!payload || typeof payload !== 'object' || !payload.razao_social) throw new Error('Unexpected CNPJ payload');
  return {
    taxId: cnpj,
    name: String(payload.razao_social),
    tradeName: payload.nome_fantasia ? String(payload.nome_fantasia) : null,
    activity: {
      code: payload.cnae_fiscal ? String(payload.cnae_fiscal) : null,
      description: payload.cnae_fiscal_descricao ? String(payload.cnae_fiscal_descricao) : null,
    },
    status: payload.descricao_situacao_cadastral ? String(payload.descricao_situacao_cadastral) : null,
    city: payload.municipio ? `${payload.municipio}/${payload.uf ?? ''}` : null,
    source: 'brasilapi',
  };
}

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} cnpj 14 digits
 * @returns {Promise<ReturnType<typeof parseCompany> | null>} null when the CNPJ is not registered
 */
export async function fetchCompany(fetchImpl, cnpj) {
  const response = await fetchImpl(`${CNPJ_BASE}/${cnpj}`, {
    headers: { accept: 'application/json', 'user-agent': 'agente-financeiro' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`BrasilAPI HTTP ${response.status}`);
  return parseCompany(await response.json(), cnpj);
}
