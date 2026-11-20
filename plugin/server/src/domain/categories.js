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
    Receitas: ['Salário', 'Pró-labore', 'Serviços prestados', 'Rendimentos', 'Reembolsos', 'Outras receitas'],
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

/**
 * Looks up a learned rule for a payee. Exact key match wins over prefix match;
 * manual rules win over rules learned from assistant suggestions.
 * @param {any[]} rules
 * @param {string} payee
 */
export function matchRule(rules, payee) {
  const key = payeeKey(payee);
  if (!key) return undefined;
  const rank = (rule) => (rule.origin === 'manual' ? 0 : 1);
  const exact = rules.filter((rule) => rule.pattern === key).sort((a, b) => rank(a) - rank(b));
  if (exact.length > 0) return exact[0];
  const prefix = rules
    .filter((rule) => rule.pattern.length >= 4 && key.startsWith(rule.pattern))
    .sort((a, b) => rank(a) - rank(b) || b.pattern.length - a.pattern.length);
  return prefix[0];
}

/**
 * Creates or updates a rule for a payee.
 * @param {any[]} rules
 * @param {string} payee
 * @param {string} categoryId
 * @param {'manual'|'assistant'} origin
 */
export function upsertRule(rules, payee, categoryId, origin) {
  const pattern = payeeKey(payee);
  if (!pattern) return undefined;
  const existing = rules.find((rule) => rule.pattern === pattern);
  if (existing) {
    if (existing.origin === 'manual' && origin !== 'manual') return existing;
    existing.categoryId = categoryId;
    existing.origin = origin;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const rule = { id: newId('rule'), pattern, categoryId, origin, hits: 0, createdAt: new Date().toISOString() };
  rules.push(rule);
  return rule;
}
