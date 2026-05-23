import chalk from 'chalk';
import { runPlatformMatrix } from '../core/validate/platform-matrix.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { logger } from '../utils/logger.js';

export async function runAdaptMatrix(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const rows = runPlatformMatrix(root);
  const platforms = [...new Set(rows.map((r) => r.platform))];

  if (opts.json) {
    printJson({ platforms, rows });
    return rows.some((r) => r.status === 'fail') ? 1 : 0;
  }

  logger.info(chalk.bold('\nPlatform matrix\n'));
  for (const p of platforms) {
    logger.info(chalk.cyan(`\n  ${p}`));
    for (const r of rows.filter((x) => x.platform === p)) {
      const icon =
        r.status === 'pass'
          ? chalk.green('✓')
          : r.status === 'fail'
            ? chalk.red('✗')
            : r.status === 'warn'
              ? chalk.yellow('⚠')
              : chalk.dim('–');
      logger.info(`    ${icon} ${r.rule}: ${r.message}`);
    }
  }
  return rows.some((r) => r.status === 'fail') ? 1 : 0;
}
