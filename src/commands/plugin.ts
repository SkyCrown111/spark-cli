import chalk from 'chalk';
import {
  installPlugin,
  listPlugins,
  uninstallPlugin,
} from '../core/plugin/manager.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export function runPluginList(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const plugins = listPlugins(root);
  if (opts.json) {
    printJson({ plugins });
    return;
  }
  console.log(chalk.bold('\nInstalled plugins\n'));
  if (!plugins.length) {
    console.log(chalk.dim('  None — run: spark-cli plugin install <path>'));
    return;
  }
  for (const p of plugins) {
    console.log(`  ${chalk.cyan(p.name)}@${p.version}  ${chalk.dim(p.path)}`);
    if (p.description) console.log(chalk.dim(`    ${p.description}`));
  }
}

export function runPluginInstall(opts: GlobalOptions, source: string): void {
  const root = resolveProjectRoot(opts);
  const installed = installPlugin(root, source);
  if (opts.json) {
    printJson({ installed });
    return;
  }
  console.log(chalk.green('✓'), `Installed plugin ${chalk.cyan(installed.name)}@${installed.version}`);
}

export function runPluginUninstall(opts: GlobalOptions, name: string): void {
  const root = resolveProjectRoot(opts);
  uninstallPlugin(root, name);
  if (opts.json) {
    printJson({ uninstalled: name });
    return;
  }
  console.log(chalk.green('✓'), `Removed plugin ${chalk.cyan(name)}`);
}
