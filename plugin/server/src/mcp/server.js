import { createInterface } from 'node:readline';

/** Protocol revisions this server understands, newest first. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const JSONRPC_ERRORS = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  internal: -32603,
};

/**
 * Minimal Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0).
 * Implements the lifecycle (initialize, ping) and the tools capability.
 */
export class McpServer {
  /**
   * @param {{ name: string, version: string, instructions?: string }} info
   * @param {import('./registry.js').ToolRegistry} registry
   */
  constructor(info, registry) {
    this.info = info;
    this.registry = registry;
  }

  /**
   * Handles one parsed JSON-RPC message and returns the response (or null for notifications).
   * @param {any} message
   */
  async handle(message) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return error(message?.id ?? null, JSONRPC_ERRORS.invalidRequest, 'Invalid request');
    }
    const isNotification = message.id === undefined || message.id === null;
    try {
      const result = await this.dispatch(message.method, message.params ?? {});
      if (isNotification) return null;
      if (result === undefined) return error(message.id, JSONRPC_ERRORS.methodNotFound, `Method not found: ${message.method}`);
      return { jsonrpc: '2.0', id: message.id, result };
    } catch (failure) {
      if (isNotification) return null;
      return error(message.id, JSONRPC_ERRORS.internal, failure.message);
    }
  }

  async dispatch(method, params) {
    switch (method) {
      case 'initialize': {
        const requested = params.protocolVersion;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0];
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.info.name, version: this.info.version },
          ...(this.info.instructions ? { instructions: this.info.instructions } : {}),
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: this.registry.list() };
      case 'tools/call':
        return this.registry.call(params.name, params.arguments);
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return {};
      default:
        return undefined;
    }
  }

  /**
   * Starts reading requests from stdin and writing responses to stdout.
   * Logs go to stderr so they never corrupt the protocol stream.
   */
  listen(input = process.stdin, output = process.stdout) {
    const lines = createInterface({ input, crlfDelay: Infinity });
    lines.on('line', async (line) => {
      if (line.trim() === '') return;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify(error(null, JSONRPC_ERRORS.parse, 'Parse error'))}\n`);
        return;
      }
      const response = await this.handle(message);
      if (response) output.write(`${JSON.stringify(response)}\n`);
    });
    lines.on('close', () => process.exit(0));
  }
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
