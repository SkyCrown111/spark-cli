import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { lintShadersInProject } from '../core/shader/lint.js';
import { translateShader, type ShaderTarget } from '../core/shader/translate.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runShaderLint(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const findings = lintShadersInProject(root);
  if (opts.json) {
    printJson({ findings });
    return 0;
  }
  logger.info(chalk.bold('\nShader lint\n'));
  for (const f of findings) {
    logger.info(`  [${f.rule}] ${f.path}: ${f.message}`);
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
    logger.error(chalk.red('File not found'));
    return 1;
  }
  const result = translateShader(readFileSync(abs, 'utf8'), target, file);
  if (opts.json) {
    printJson(result);
    return 0;
  }
  logger.info(result.output);
  if (result.unsafe) logger.info(chalk.yellow('\n⚠ Unsafe / best-effort translation'));
  return 0;
}
