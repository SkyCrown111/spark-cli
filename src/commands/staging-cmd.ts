import chalk from 'chalk';
import { applyStaging, clearStaging, showDiff, hasStaging } from '../core/staging/patch-manager.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import { appendReplayEvent } from '../core/replay/log.js';
import { SparkCLIError } from '../utils/errors.js';

export function runDiff(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  if (!hasStaging(root)) {
    console.log(chalk.dim('No staged changes.'));
    return;
  }
  const diff = showDiff(root);
  if (opts.json) {
    console.log(JSON.stringify({ diff }, null, 2));
    return;
  }
  console.log(diff || chalk.dim('(empty diff)'));
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
      console.log(chalk.yellow('Dry run — would apply:'));
      for (const f of files) console.log(' ', f);
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify({ applied: files }, null, 2));
      return;
    }
    appendReplayEvent(root, 'apply', { files });
    console.log(chalk.green('✓'), `Applied ${files.length} file(s):`);
    for (const f of files) console.log(chalk.cyan(' ', f));
  } catch (e) {
    if (e instanceof SparkCLIError) throw e;
    throw e;
  }
}

export function runRevert(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  if (!hasStaging(root)) {
    console.log(chalk.dim('Nothing to revert.'));
    return;
  }
  clearStaging(root);
  appendReplayEvent(root, 'revert', {});
  console.log(chalk.green('✓'), 'Staging cleared.');
}
