import chalk from 'chalk';
import {
  addProjectMemory,
  clearAllMemory,
  clearProjectMemory,
  clearSessionMemory,
  getProjectMemory,
  getSessionMemory,
} from '../core/memory/store.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export function runMemoryShow(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const project = getProjectMemory(root);
  const session = getSessionMemory(root);

  if (opts.json) {
    printJson({ project, session });
    return;
  }

  logger.info(chalk.bold('\nProject memory\n'));
  if (!project.entries.length) logger.info(chalk.dim('  (empty)'));
  for (const e of project.entries) {
    logger.info(`  ${chalk.cyan(e.key)}: ${e.value}`);
  }

  logger.info(chalk.bold('\nSession memory\n'));
  if (!session.entries.length) logger.info(chalk.dim('  (empty)'));
  for (const e of session.entries) {
    logger.info(`  ${chalk.cyan(e.key)}: ${e.value}`);
  }
}

export function runMemoryAdd(opts: GlobalOptions, key: string, value: string): void {
  const root = resolveProjectRoot(opts);
  addProjectMemory(root, key, value);
  if (opts.json) {
    printJson({ key, value });
    return;
  }
  logger.info(chalk.green('✓'), 'Remembered', chalk.cyan(key));
}

export function runMemoryClear(opts: GlobalOptions, scope?: string): void {
  const root = resolveProjectRoot(opts);
  if (scope === 'session') clearSessionMemory(root);
  else if (scope === 'project') clearProjectMemory(root);
  else clearAllMemory(root);

  if (opts.json) {
    printJson({ cleared: scope ?? 'all' });
    return;
  }
  logger.info(chalk.green('✓'), `Cleared ${scope ?? 'all'} memory`);
}
