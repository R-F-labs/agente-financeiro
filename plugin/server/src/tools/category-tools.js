import { object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { newId } from '../lib/text.js';
import { UserError } from '../lib/errors.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const categoryTools = [
  {
    name: 'list_categories',
    title: 'Listar categorias',
    description: 'Lista as categorias de receitas e despesas, agrupadas. Use os ids ao categorizar.',
    inputSchema: object({ include_inactive: { type: 'boolean' } }),
    annotations: { readOnlyHint: true },
    handler: ({ include_inactive }) => {
      const categories = requireStore()
        .get('categories')
        .filter((category) => include_inactive || category.active !== false);
      const groups = {};
      for (const category of categories) {
        const key = `${category.kind === 'income' ? 'Receita' : 'Despesa'} > ${category.group}`;
        (groups[key] ??= []).push({ id: category.id, name: category.name, active: category.active !== false });
      }
      return { groups };
    },
  },
  {
    name: 'upsert_category',
    title: 'Criar ou alterar categoria',
    description: 'Cria uma categoria (sem category_id) ou renomeia, move de grupo ou desativa uma existente.',
    inputSchema: object({
      category_id: { type: 'string' },
      name: { type: 'string', minLength: 2 },
      group: { type: 'string', minLength: 2 },
      kind: { type: 'string', enum: ['income', 'expense'] },
      active: { type: 'boolean' },
    }),
    handler: (input) =>
      requireStore().transact((data) => {
        if (input.category_id) {
          const category = data.categories.find((item) => item.id === input.category_id);
          if (!category) throw new UserError(`Categoria não encontrada: ${input.category_id}`);
          for (const key of ['name', 'group', 'kind', 'active']) if (input[key] !== undefined) category[key] = input[key];
          return { saved: true, category };
        }
        if (!input.name || !input.group || !input.kind) throw new UserError('Para criar, informe name, group e kind.');
        const duplicate = data.categories.find((item) => item.name.toLowerCase() === input.name.toLowerCase());
        if (duplicate) throw new UserError(`Já existe a categoria "${duplicate.name}" (${duplicate.id}).`);
        const category = { id: newId('cat'), name: input.name, group: input.group, kind: input.kind, active: true, system: false };
        data.categories.push(category);
        return { saved: true, category };
      }),
  },
  {
    name: 'list_category_rules',
    title: 'Listar regras de categorização',
    description: 'Lista as regras aprendidas (beneficiário -> categoria). Útil para mostrar ao usuário o que o agente já sabe.',
    inputSchema: object({ search: { type: 'string' } }),
    annotations: { readOnlyHint: true },
    handler: ({ search }) => {
      const store = requireStore();
      const names = new Map(store.get('categories').map((category) => [category.id, category.name]));
      const term = search?.toUpperCase();
      return {
        rules: store
          .get('categoryRules')
          .filter((rule) => !term || rule.pattern.includes(term))
          .map((rule) => ({ id: rule.id, payee: rule.pattern, category: names.get(rule.categoryId), origin: rule.origin, hits: rule.hits })),
      };
    },
  },
];
