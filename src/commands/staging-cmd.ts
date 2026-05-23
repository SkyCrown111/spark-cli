import chalk from 'chalk';
import { applyStaging, clearStaging, showDiff, hasStaging } from '../core/staging/patch-manager.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { appendReplayEvent } from '../core/replay/log.js';
import { SparkCLIError } from '../utils/errors.js';

export function runDiff(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  if (!hasStaging(root)) {
    logger.info(chalk.dim('No staged changes.'));
    return;
  }
  const diff = showDiff(root);
  if (opts.json) {
    logger.json({ diff });
    return;
  }
  logger.info(diff || chalk.dim('(empty diff)'));
}

export async function runApply(opts: GlobalOptions): Promise<void> {
  const root = resolveProjectRoot(opts);
  try {
    const files = await applyStaging(root, {
      yes: opts.yes,
      backup: true,
      dryRun: opts.dryRun,
    });
    if (opts.dryRun) {
      logger.info(chalk.yellow('Dry run — would apply:'));
      for (const f of files) logger.info(' ', f);
      return;
    }
    if (opts.json) {
      logger.json({ applied: files });
      return;
    }
    appendReplayEvent(root, 'apply', { files });
    logger.info(chalk.green('✓'), `Applied ${files.length} file(s):`);
    for (const f of files) logger.info(chalk.cyan(' ', f));
  } catch (e) {
    if (e instanceof SparkCLIError) throw e;
    throw e;
  }
}

export function runRevert(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  if (!hasStaging(root)) {
    logger.info(chalk.dim('Nothing to revert.'));
    return;
  }
  clearStaging(root);
  appendReplayEvent(root, 'revert', {});
  logger.info(chalk.green('✓'), 'Staging cleared.');
}
