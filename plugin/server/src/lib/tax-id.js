/**
 * Brazilian taxpayer ids (CPF for people, CNPJ for companies) found in statement lines.
 * Pix, TED and boleto descriptions usually carry the counterparty's id, which identifies
 * the counterparty far better than the free-text name.
 */

const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

const repeated = (digits) => /^(\d)\1+$/.test(digits);

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || repeated(digits)) return false;
  const check = (length) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(digits[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isValidCpf(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || repeated(digits)) return false;
  const check = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

const CNPJ_PATTERN = /(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?!\d)/g;
const CPF_PATTERN = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g;

/**
 * Finds the first valid CNPJ or CPF in a text. Masked ids ("***.456.789-**") are ignored
 * because they cannot be validated. CNPJ wins when both appear.
 * @param {...(string|null|undefined)} texts
 * @returns {{ kind: 'cnpj'|'cpf', digits: string } | null}
 */
export function extractTaxId(...texts) {
  const text = texts.filter(Boolean).join(' ');
  for (const match of text.matchAll(CNPJ_PATTERN)) {
    if (isValidCnpj(match[1])) return { kind: 'cnpj', digits: onlyDigits(match[1]) };
  }
  for (const match of text.matchAll(CPF_PATTERN)) {
    if (isValidCpf(match[1])) return { kind: 'cpf', digits: onlyDigits(match[1]) };
  }
  return null;
}

/**
 * Normalizes an id typed by the user or the assistant.
 * @param {string} value
 * @returns {{ kind: 'cnpj'|'cpf', digits: string } | null}
 */
export function parseTaxId(value) {
  const digits = onlyDigits(value);
  if (isValidCnpj(digits)) return { kind: 'cnpj', digits };
  if (isValidCpf(digits)) return { kind: 'cpf', digits };
  return null;
}

/**
 * Display form. CPFs are always masked: only the middle digits are shown, as banks do.
 * @param {{ kind: 'cnpj'|'cpf', digits: string } | null | undefined} id
 * @returns {string | null}
 */
export function formatTaxId(id) {
  if (!id) return null;
  const d = id.digits;
  if (id.kind === 'cnpj') return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
