import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/**
 * Runs `node --check` on every source and test file, so syntax errors are caught
 * without any external linter.
 */
const roots = ['src', 'test', 'scripts'];
const files = roots.flatMap((root) => walk(fileURLToPath(new URL(`../${root}`, import.meta.url))));
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(result.stderr);
  }
}
process.stdout.write(`${files.length} arquivos verificados, ${failed} com erro.\n`);
process.exit(failed > 0 ? 1 : 0);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.js') ? [path] : [];
  });
}
