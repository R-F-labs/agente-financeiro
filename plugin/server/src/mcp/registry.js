import { validateSchema } from '../lib/validate.js';
import { UserError } from '../lib/errors.js';
import { present } from './presentation.js';
import { ConfirmationGate } from '../guardrails/confirmation.js';
import { runOperation } from '../guardrails/operation-context.js';

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {Record<string, any>} inputSchema JSON Schema of the arguments
 * @property {{ readOnlyHint?: boolean, destructiveHint?: boolean, idempotentHint?: boolean, openWorldHint?: boolean }} [annotations]
 * @property {(args: any) => unknown | Promise<unknown>} handler
 * @property {(args: any) => ConfirmationRequest | null | undefined} [confirm]
 *   Returns a request when this particular call needs the user's explicit agreement.
 */

/**
 * @typedef {Object} ConfirmationRequest
 * @property {string} summary What will change, in words the user understands.
 * @property {Record<string, unknown>} [details]
 */

const TOKEN_PROPERTY = {
  type: 'string',
  description: 'Somente depois que o usuário concordou com o resumo devolvido em confirmation_required: repita a mesma chamada com este código.',
};

/**
 * Holds the tool definitions and executes calls with argument validation.
 */
export class ToolRegistry {
  /**
   * @param {{ confirmations?: ConfirmationGate }} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
    this.confirmations = options.confirmations ?? new ConfirmationGate();
  }

  /**
   * @param {ToolDefinition[]} definitions
   */
  register(definitions) {
    for (const definition of definitions) {
      if (this.tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`);
      if (!definition.annotations) throw new Error(`Tool without annotations: ${definition.name}`);
      const inputSchema = definition.confirm
        ? { ...definition.inputSchema, properties: { ...definition.inputSchema.properties, confirmation_token: TOKEN_PROPERTY } }
        : definition.inputSchema;
      this.tools.set(definition.name, { ...definition, inputSchema });
    }
    return this;
  }

  /** Tool list in the MCP `tools/list` format. */
  list() {
    return [...this.tools.values()].map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      ...(annotations ? { annotations } : {}),
    }));
  }

  /**
   * Executes a tool and returns an MCP `tools/call` result. Expected problems are
   * returned as `isError` results so the assistant can correct itself.
   * @param {string} name
   * @param {unknown} args
   */
  async call(name, args) {
    const tool = this.tools.get(name);
    if (!tool) return errorResult(`Ferramenta desconhecida: ${name}`);
    const input = args ?? {};
    const errors = validateSchema(tool.inputSchema, input);
    if (errors.length > 0) return errorResult(`Argumentos inválidos:\n- ${errors.join('\n- ')}`);
    try {
      const output = present(await runOperation(name, async () => {
        const request = tool.confirm?.(input);
        if (request && !this.confirmations.consume(name, input, input.confirmation_token)) {
          return confirmationRequired(name, input, request, this.confirmations);
        }
        return tool.handler(input);
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: isObject(output) ? output : { result: output },
      };
    } catch (error) {
      if (error instanceof UserError) {
        return errorResult(error.details ? `${error.message}\n${JSON.stringify(error.details, null, 2)}` : error.message);
      }
      process.stderr.write(`[agente-financeiro] ${name} failed: ${error.stack ?? error}\n`);
      return errorResult(`Erro interno ao executar ${name}: ${error.message}`);
    }
  }
}

function confirmationRequired(name, input, request, gate) {
  const { confirmation_token: previous, ...args } = input;
  return {
    status: 'confirmation_required',
    summary: request.summary,
    details: request.details,
    confirmation_token: gate.issue(name, args),
    expiresInMinutes: Math.round(gate.ttlMs / 60000),
    tokenRejected: previous !== undefined ? true : undefined,
    instructions:
      'Nada foi alterado. Mostre o resumo ao usuário com suas palavras e pergunte se ele concorda. Só se ele disser que sim, repita exatamente a mesma chamada com confirmation_token. Nunca confirme por conta própria.',
  };
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
