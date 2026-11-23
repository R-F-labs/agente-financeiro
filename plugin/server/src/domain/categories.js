import { newId, payeeKey } from '../lib/text.js';

/**
 * Default category tree. The user can add, rename or deactivate categories later.
 * Names are in Portuguese because they are shown to the end user.
 */
const DEFAULT_TREE = {
  expense: {
    Moradia: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Gás', 'Internet e telefone', 'Manutenção da casa'],
    Alimentação: ['Mercado', 'Restaurantes', 'Delivery', 'Padaria e café'],
    Transporte: ['Aplicativos de transporte', 'Combustível', 'Estacionamento e pedágio', 'Transporte público', 'Manutenção do veículo', 'Seguro do veículo'],
    Saúde: ['Plano de saúde', 'Farmácia', 'Consultas e exames', 'Academia e esportes'],
    Educação: ['Mensalidades', 'Cursos e livros'],
    Lazer: ['Viagens', 'Passeios e eventos', 'Bares'],
    Assinaturas: ['Streaming', 'Softwares e serviços digitais'],
    Compras: ['Vestuário', 'Eletrônicos', 'Casa e decoração', 'Presentes', 'Cuidados pessoais'],
    'Serviços financeiros': ['Tarifas bancárias', 'Juros e IOF', 'Anuidade'],
    Dívidas: ['Renegociação', 'Empréstimos e financiamentos'],
    Seguros: ['Seguro de vida', 'Outros seguros'],
    Impostos: ['Impostos e taxas'],
    Família: ['Pets', 'Filhos', 'Ajuda a familiares'],
    Outros: ['Outras despesas'],
  },
  income: {
    Receitas: ['Salário', 'Pró-labore', 'Distribuição de lucros', 'Serviços prestados', 'Rendimentos', 'Reembolsos', 'Outras receitas'],
  },
};

/**
 * @returns {Array<{ id: string, name: string, group: string, kind: 'income'|'expense', active: boolean, system: boolean }>}
 */
export function seedCategories() {
  const categories = [];
  for (const [kind, groups] of Object.entries(DEFAULT_TREE)) {
    for (const [group, names] of Object.entries(groups)) {
      for (const name of names) {
        categories.push({ id: newId('cat'), name, group, kind, active: true, system: true });
      }
    }
  }
  return categories;
}

/**
 * Finds a category by id or by (case-insensitive) name.
 * @param {any[]} categories
 * @param {string} ref
 */
export function findCategory(categories, ref) {
  if (!ref) return undefined;
  const byId = categories.find((category) => category.id === ref);
  if (byId) return byId;
  const target = ref.trim().toLowerCase();
  return categories.find((category) => category.name.toLowerCase() === target);
}

const rank = (rule) => (rule.origin === 'manual' ? 0 : 1);

/**
 * Looks up a learned rule. A rule tied to the counterparty's CPF/CNPJ wins over
 * rules matched by name; exact name match wins over prefix match; manual rules win
 * over rules learned from assistant suggestions.
 * @param {any[]} rules
 * @param {string} payee
 * @param {{ kind: string, digits: string } | null} [taxId]
 */
export function matchRule(rules, payee, taxId = null) {
  if (taxId) {
    const byId = rules.filter((rule) => rule.taxId === taxId.digits).sort((a, b) => rank(a) - rank(b));
    if (byId.length > 0) return byId[0];
  }
  const key = payeeKey(payee);
  if (!key) return undefined;
  const byName = rules.filter((rule) => !rule.taxId);
  const exact = byName.filter((rule) => rule.pattern === key).sort((a, b) => rank(a) - rank(b));
  if (exact.length > 0) return exact[0];
  const prefix = byName
    .filter((rule) => rule.pattern.length >= 4 && key.startsWith(rule.pattern))
    .sort((a, b) => rank(a) - rank(b) || b.pattern.length - a.pattern.length);
  return prefix[0];
}

/**
 * Creates or updates a rule. With a CPF/CNPJ the rule is tied to the id, so the
 * same counterparty is recognized even when the bank prints its name differently.
 * @param {any[]} rules
 * @param {string} payee
 * @param {string} categoryId
 * @param {'manual'|'assistant'} origin
 * @param {{ kind: 'cnpj'|'cpf', digits: string } | null} [taxId]
 */
export function upsertRule(rules, payee, categoryId, origin, taxId = null) {
  const pattern = payeeKey(payee);
  if (!pattern && !taxId) return undefined;
  const existing = taxId
    ? rules.find((rule) => rule.taxId === taxId.digits)
    : rules.find((rule) => !rule.taxId && rule.pattern === pattern);
  if (existing) {
    if (existing.origin === 'manual' && origin !== 'manual') return existing;
    existing.categoryId = categoryId;
    existing.origin = origin;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const rule = {
    id: newId('rule'),
    pattern: pattern || taxId.digits,
    taxId: taxId?.digits ?? null,
    taxIdKind: taxId?.kind ?? null,
    categoryId,
    origin,
    hits: 0,
    createdAt: new Date().toISOString(),
  };
  rules.push(rule);
  return rule;
}
