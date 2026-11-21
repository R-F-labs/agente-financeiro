import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allTools } from '../src/tools/index.js';

/**
 * Generates docs/ferramentas.md from the tool definitions, so the reference
 * never drifts from the code. Run with: npm run docs
 */
const target = fileURLToPath(new URL('../../../docs/ferramentas.md', import.meta.url));
const lines = [
  '# Referência das ferramentas',
  '',
  'Documento gerado automaticamente a partir do código (`npm run docs` em `plugin/server`). Não edite manualmente.',
  '',
  'Todas as ferramentas recebem e devolvem JSON. Valores monetários são retornados em reais; despesas são negativas.',
  '',
  '| Ferramenta | Título | Somente leitura |',
  '|---|---|---|',
  ...allTools().map((tool) => `| \`${tool.name}\` | ${tool.title} | ${tool.annotations?.readOnlyHint ? 'Sim' : 'Não'} |`),
  '',
];
for (const tool of allTools()) {
  lines.push(`## ${tool.name}`, '', `**${tool.title}**`, '', tool.description, '');
  const properties = Object.entries(tool.inputSchema.properties ?? {});
  if (properties.length === 0) {
    lines.push('Sem parâmetros.', '');
    continue;
  }
  const required = new Set(tool.inputSchema.required ?? []);
  lines.push('| Parâmetro | Tipo | Obrigatório | Descrição |', '|---|---|---|---|');
  for (const [name, schema] of properties) {
    const type = Array.isArray(schema.type) ? schema.type.join(' ou ') : schema.type ?? '';
    const details = [schema.description, schema.enum ? `Valores: ${schema.enum.map((v) => `\`${v}\``).join(', ')}` : null]
      .filter(Boolean)
      .join(' ');
    lines.push(`| \`${name}\` | ${type} | ${required.has(name) ? 'Sim' : 'Não'} | ${escapeTableCell(details)} |`);
  }
  lines.push('');
}

/**
 * Makes text safe inside a Markdown table cell: backslashes first, so that an
 * existing backslash cannot cancel the escape added to a pipe, then pipes and
 * line breaks (which would end the row).
 * @param {string} text
 */
function escapeTableCell(text) {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

writeFileSync(target, `${lines.join('\n')}\n`);
process.stdout.write(`Gerado ${target}\n`);
