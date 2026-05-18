import chalk from 'chalk';
import {
  addProjectMemory,
  clearAllMemory,
  clearProjectMemory,
  clearSessionMemory,
  getProjectMemory,
  getSessionMemory,
} from '../core/memory/store.js';
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

  console.log(chalk.bold('\nProject memory\n'));
  if (!project.entries.length) console.log(chalk.dim('  (empty)'));
  for (const e of project.entries) {
    console.log(`  ${chalk.cyan(e.key)}: ${e.value}`);
  }

  console.log(chalk.bold('\nSession memory\n'));
  if (!session.entries.length) console.log(chalk.dim('  (empty)'));
  for (const e of session.entries) {
    console.log(`  ${chalk.cyan(e.key)}: ${e.value}`);
  }
}

export function runMemoryAdd(
  opts: GlobalOptions,
  key: string,
  value: string,
): void {
  const root = resolveProjectRoot(opts);
  addProjectMemory(root, key, value);
  if (opts.json) {
    printJson({ key, value });
    return;
  }
  console.log(chalk.green('✓'), 'Remembered', chalk.cyan(key));
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
  console.log(chalk.green('✓'), `Cleared ${scope ?? 'all'} memory`);
}
