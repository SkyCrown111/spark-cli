import chalk from 'chalk';
import { lintPerfInProject } from '../core/validate/perf-lint.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runValidatePerf(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const findings = lintPerfInProject(root);

  if (opts.json) {
    printJson({ ok: findings.length === 0, findings });
    return findings.some((f) => f.severity === 'error') ? 1 : 0;
  }

  logger.info(chalk.bold('\nPerf lint\n'));
  if (findings.length === 0) {
    logger.info(chalk.green('  No issues found.'));
    return 0;
  }
  for (const f of findings) {
    const icon = f.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
    const loc = f.line ? `:${f.line}` : '';
    logger.info(`  ${icon} [${f.id}] ${f.path}${loc} — ${f.message}`);
  }
  return findings.some((x) => x.severity === 'error') ? 1 : 0;
}
