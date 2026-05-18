import chalk from 'chalk';
import { loadMergedConfig } from '../config/load.js';
import { publishPlatform } from '../engines/platform/publish.js';
import { publishWechat } from '../engines/wechat/publish.js';
import type { PlatformId } from '../core/validate/platform-rules.js';
import { getPlatform } from '../platforms/registry.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runPublishPlatform(
  platform: PlatformId,
  opts: GlobalOptions,
  env: 'preview' | 'production',
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);

  const result =
    platform === 'wechat'
      ? publishWechat(root, config, { env, dryRun: opts.dryRun })
      : publishPlatform(platform, root, config, { env, dryRun: opts.dryRun });

  if (opts.json) {
    printJson({ platform, ...result });
    return result.ok ? 0 : 1;
  }

  const label = getPlatform(platform)?.label ?? platform;
  console.log(chalk.bold(`\nPublish ${label} (${env})\n`));
  if (result.command) console.log(chalk.dim('  Command:'), result.command);
  console.log(result.ok ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.ok ? 0 : 1;
}

/** @deprecated */
export async function runPublishWechat(
  opts: GlobalOptions,
  env: 'preview' | 'production',
): Promise<number> {
  return runPublishPlatform('wechat', opts, env);
}
