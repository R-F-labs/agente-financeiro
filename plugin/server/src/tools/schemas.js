/**
 * Reusable JSON Schema fragments for tool inputs.
 */

export const amount = {
  type: ['number', 'string'],
  description: 'Valor em reais. Número (1234.56) ou texto como impresso ("R$ 1.234,56", "-R$ 10,00").',
};

export const optionalAmount = { ...amount, type: ['number', 'string', 'null'] };

export const date = { type: 'string', format: 'date', description: 'Data no formato AAAA-MM-DD.' };

export const month = { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'Mês no formato AAAA-MM.' };

export const id = { type: 'string', minLength: 3 };

/**
 * @param {Record<string, any>} properties
 * @param {string[]} [required]
 */
export function object(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}
