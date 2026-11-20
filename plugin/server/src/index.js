#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { McpServer } from './mcp/server.js';
import { ToolRegistry } from './mcp/registry.js';
import { allTools } from './tools/index.js';

const MIN_NODE_MAJOR = 18;
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE_MAJOR) {
  process.stderr.write(`[agente-financeiro] Node.js ${MIN_NODE_MAJOR}+ é necessário (encontrado ${process.versions.node}).\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const INSTRUCTIONS = [
  'Agente Financeiro: guarda e calcula dados financeiros pessoais no computador do usuário.',
  'Comece cada conversa com get_status. Valores retornados estão em reais; despesas são negativas.',
  'O servidor confere totais, elimina duplicidades e faz todas as contas: não recalcule números.',
  'Siga a skill agente-financeiro para leitura de documentos, categorização e fechamento do mês.',
].join(' ');

const registry = new ToolRegistry().register(allTools());
new McpServer({ name: 'agente-financeiro', version: pkg.version, instructions: INSTRUCTIONS }, registry).listen();
