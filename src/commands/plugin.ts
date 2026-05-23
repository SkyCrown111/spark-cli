import chalk from 'chalk';
import { installPlugin, listPlugins, uninstallPlugin } from '../core/plugin/manager.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export function runPluginList(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const plugins = listPlugins(root);
  if (opts.json) {
    printJson({ plugins });
    return;
  }
  logger.info(chalk.bold('\nInstalled plugins\n'));
  if (!plugins.length) {
    logger.info(chalk.dim('  None — run: spark-cli plugin install <path>'));
    return;
  }
  for (const p of plugins) {
    logger.info(`  ${chalk.cyan(p.name)}@${p.version}  ${chalk.dim(p.path)}`);
    if (p.description) logger.info(chalk.dim(`    ${p.description}`));
  }
}

export function runPluginInstall(opts: GlobalOptions, source: string): void {
  const root = resolveProjectRoot(opts);
  const installed = installPlugin(root, source);
  if (opts.json) {
    printJson({ installed });
    return;
  }
  logger.info(
    chalk.green('✓'),
    `Installed plugin ${chalk.cyan(installed.name)}@${installed.version}`,
  );
}

export function runPluginUninstall(opts: GlobalOptions, name: string): void {
  const root = resolveProjectRoot(opts);
  uninstallPlugin(root, name);
  if (opts.json) {
    printJson({ uninstalled: name });
    return;
  }
  logger.info(chalk.green('✓'), `Removed plugin ${chalk.cyan(name)}`);
}
