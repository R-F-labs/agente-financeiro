import { findCategory } from './categories.js';
import { normalizeText } from '../lib/text.js';

/**
 * Well-known platforms whose registered activity does not reveal what the user bought.
 * Matched against the company and trade names (normalized).
 */
const KNOWN_BRANDS = [
  { pattern: /\b(IFOOD|RAPPI|AIQFOME|ZE DELIVERY)\b/, category: 'Delivery' },
  { pattern: /\b(UBER|99 TECNOLOGIA|99POP|INDRIVE|CABIFY)\b/, category: 'Aplicativos de transporte' },
  { pattern: /\b(NETFLIX|SPOTIFY|DISNEY|GLOBOPLAY|DEEZER|HBO|PRIME VIDEO)\b/, category: 'Streaming' },
  { pattern: /\b(SMART FIT|BLUEFIT|SELFIT|GYMPASS|WELLHUB|TOTALPASS)\b/, category: 'Academia e esportes' },
];

/**
 * Registered main activity (CNAE, first 4 digits) -> default category name.
 * The suggestion is only a starting point: the assistant confirms with the user when unsure.
 */
const CNAE_PREFIXES = [
  [['4711', '4712', '4721', '4722', '4723', '4724', '4729'], 'Mercado'],
  [['5611', '5612'], 'Restaurantes'],
  [['5620'], 'Restaurantes'],
  [['1091', '1092'], 'Padaria e café'],
  [['4731', '4732'], 'Combustível'],
  [['5223'], 'Estacionamento e pedágio'],
  [['4921', '4922', '4950', '5011', '5012'], 'Transporte público'],
  [['4923'], 'Aplicativos de transporte'],
  [['4520', '4530', '4541', '4543'], 'Manutenção do veículo'],
  [['4771'], 'Farmácia'],
  [['8610', '8630', '8640', '8650', '8660', '8690'], 'Consultas e exames'],
  [['6550'], 'Plano de saúde'],
  [['9311', '9312', '9313', '9319'], 'Academia e esportes'],
  [['8511', '8512', '8513', '8520', '8531', '8532', '8533', '8541', '8542'], 'Mensalidades'],
  [['8591', '8592', '8593', '8599', '4761'], 'Cursos e livros'],
  [['3511', '3512', '3513', '3514'], 'Energia'],
  [['3600', '3701'], 'Água'],
  [['3520', '4784'], 'Gás'],
  [['6110', '6120', '6130', '6141', '6142', '6143', '6190'], 'Internet e telefone'],
  [['5911', '5912', '5913', '6021', '6022'], 'Streaming'],
  [['6201', '6202', '6203', '6204', '6209', '6311', '6319'], 'Softwares e serviços digitais'],
  [['5510', '5590', '7911', '7912', '7990', '5111', '5112'], 'Viagens'],
  [['9001', '9002', '9003', '9329', '5914'], 'Passeios e eventos'],
  [['4781', '4782', '1412', '1413'], 'Vestuário'],
  [['4751', '4752', '4753'], 'Eletrônicos'],
  [['4754', '4755', '4759', '4744'], 'Casa e decoração'],
  [['9602', '4772'], 'Cuidados pessoais'],
  [['7500'], 'Pets'],
  [['6511', '6512'], 'Seguro de vida'],
  [['6520', '6530'], 'Outros seguros'],
  [['6810', '6821', '6822'], 'Aluguel'],
  [['8112'], 'Condomínio'],
];

/**
 * Suggests a category name from what the public registry says about a company.
 * Returns the category of the user's own list (it may have been renamed or deactivated).
 * @param {any[]} categories
 * @param {{ name?: string|null, tradeName?: string|null, activity?: { code?: string|null } | null }} company
 * @returns {{ categoryId: string, category: string, reason: string } | null}
 */
export function suggestCategoryFor(categories, company) {
  const names = normalizeText(`${company.tradeName ?? ''} ${company.name ?? ''}`);
  const brand = KNOWN_BRANDS.find((item) => item.pattern.test(names));
  const code = String(company.activity?.code ?? '').replace(/\D/g, '');
  const byActivity = CNAE_PREFIXES.find(([prefixes]) => prefixes.some((prefix) => code.startsWith(prefix)));
  const pick = brand
    ? { name: brand.category, reason: 'marca conhecida' }
    : byActivity
      ? { name: byActivity[1], reason: `atividade principal ${code}` }
      : null;
  if (!pick) return null;
  const category = findCategory(categories, pick.name);
  if (!category || category.active === false) return null;
  return { categoryId: category.id, category: `${category.group} > ${category.name}`, reason: pick.reason };
}

/**
 * Saves (or refreshes) what was learned about a company in the local memory.
 * @param {any} data
 * @param {{ taxId: string, name: string|null, tradeName: string|null, activity: { code: string|null, description: string|null }, status: string|null, source: string }} entry
 */
export function rememberCounterparty(data, entry) {
  data.counterparties ??= [];
  const now = new Date().toISOString();
  const existing = data.counterparties.find((item) => item.taxId === entry.taxId);
  if (existing) {
    Object.assign(existing, entry, { checkedAt: now });
    return existing;
  }
  const record = { ...entry, kind: 'cnpj', checkedAt: now };
  data.counterparties.push(record);
  return record;
}
