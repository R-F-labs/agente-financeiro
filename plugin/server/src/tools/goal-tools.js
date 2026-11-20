import { amount, date, object } from './schemas.js';
import { requireStore } from '../storage/workspace.js';
import { newId } from '../lib/text.js';
import { toCents } from '../lib/money.js';
import { UserError } from '../lib/errors.js';

/** @type {import('../mcp/registry.js').ToolDefinition[]} */
export const goalTools = [
  {
    name: 'list_goals',
    title: 'Listar metas',
    description: 'Lista as metas financeiras por prioridade.',
    inputSchema: object({}),
    annotations: { readOnlyHint: true },
    handler: () => ({
      goals: requireStore()
        .get('goals')
        .filter((goal) => goal.active !== false)
        .sort((a, b) => a.priority - b.priority),
    }),
  },
  {
    name: 'upsert_goal',
    title: 'Criar ou alterar meta',
    description: 'Cria uma meta (sem goal_id) ou altera uma existente. Prioridade 1 é a mais importante.',
    inputSchema: object({
      goal_id: { type: 'string' },
      name: { type: 'string', minLength: 2 },
      target: amount,
      current: amount,
      deadline: date,
      priority: { type: 'integer', minimum: 1, maximum: 20 },
      active: { type: 'boolean' },
    }),
    handler: (input) =>
      requireStore().transact((data) => {
        let goal = input.goal_id ? data.goals.find((item) => item.id === input.goal_id) : undefined;
        if (input.goal_id && !goal) throw new UserError(`Meta não encontrada: ${input.goal_id}`);
        if (!goal) {
          for (const field of ['name', 'target', 'deadline']) {
            if (input[field] === undefined) throw new UserError(`Para criar uma meta, informe ${field}.`);
          }
          goal = { id: newId('goal'), active: true, currentCents: 0, priority: data.goals.length + 1, createdAt: new Date().toISOString() };
          data.goals.push(goal);
        }
        if (input.name !== undefined) goal.name = input.name;
        if (input.target !== undefined) goal.targetCents = toCents(input.target);
        if (input.current !== undefined) goal.currentCents = toCents(input.current);
        if (input.deadline !== undefined) goal.deadline = input.deadline;
        if (input.priority !== undefined) goal.priority = input.priority;
        if (input.active !== undefined) goal.active = input.active;
        goal.updatedAt = new Date().toISOString();
        return { saved: true, goal };
      }),
  },
];
