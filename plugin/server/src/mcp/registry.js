import { validateSchema } from '../lib/validate.js';
import { UserError } from '../lib/errors.js';
import { present } from './presentation.js';

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {Record<string, any>} inputSchema JSON Schema of the arguments
 * @property {{ readOnlyHint?: boolean, destructiveHint?: boolean, idempotentHint?: boolean, openWorldHint?: boolean }} [annotations]
 * @property {(args: any) => unknown | Promise<unknown>} handler
 */

/**
 * Holds the tool definitions and executes calls with argument validation.
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
  }

  /**
   * @param {ToolDefinition[]} definitions
   */
  register(definitions) {
    for (const definition of definitions) {
      if (this.tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`);
      this.tools.set(definition.name, definition);
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
      const output = present(await tool.handler(input));
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

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
