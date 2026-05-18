import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { lintShadersInProject } from '../core/shader/lint.js';
import { translateShader, type ShaderTarget } from '../core/shader/translate.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runShaderLint(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const findings = lintShadersInProject(root);
  if (opts.json) {
    printJson({ findings });
    return 0;
  }
  console.log(chalk.bold('\nShader lint\n'));
  for (const f of findings) {
    console.log(`  [${f.rule}] ${f.path}: ${f.message}`);
  }
  return 0;
}

export async function runShaderTranslate(
  opts: GlobalOptions,
  file: string,
  target: ShaderTarget,
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const abs = join(root, file);
  if (!existsSync(abs)) {
    console.error(chalk.red('File not found'));
    return 1;
  }
  const result = translateShader(readFileSync(abs, 'utf8'), target, file);
  if (opts.json) {
    printJson(result);
    return 0;
  }
  console.log(result.output);
  if (result.unsafe) console.log(chalk.yellow('\n⚠ Unsafe / best-effort translation'));
  return 0;
}
