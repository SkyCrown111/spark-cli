import { readFileSync } from 'node:fs';
import chalk from 'chalk';
import { exportReplay } from '../core/replay/export.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runReplayExport(
  opts: GlobalOptions,
  output?: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const path = await exportReplay(root, output);

  if (opts.json) {
    printJson(JSON.parse(readFileSync(path, 'utf8')));
    return;
  }

  console.log(chalk.green('✓'), 'Exported replay to', chalk.cyan(path));
  console.log(chalk.dim('  Includes: events log, staging manifest/diff (if any)'));
}
