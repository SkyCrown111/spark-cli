import chalk from 'chalk';
import {
  applyPlatformAdaptFixes,
  runPlatformAdapt,
} from '../engines/platform/adapt.js';
import { loadMergedConfig } from '../config/load.js';
import type { PlatformId } from '../core/validate/platform-rules.js';
import { getPlatform } from '../platforms/registry.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runAdaptPlatform(
  platform: PlatformId,
  opts: GlobalOptions & { fix?: boolean },
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const report = runPlatformAdapt(platform, root, config);

  if (opts.fix && !opts.dryRun) {
    const fix = applyPlatformAdaptFixes(platform, root, report);
    report.issues.push({
      id: 'fix_applied',
      severity: 'info',
      category: 'config',
      message: fix.applied.join('; '),
    });
  }

  if (opts.json) {
    printJson(report);
    return report.ok ? 0 : 1;
  }

  const label = getPlatform(platform)?.label ?? platform;
  console.log(chalk.bold(`\nAdapt ${label}\n`));

  for (const issue of report.issues) {
    const icon =
      issue.severity === 'error'
        ? chalk.red('✗')
        : issue.severity === 'warn'
          ? chalk.yellow('⚠')
          : chalk.blue('i');
    console.log(`  ${icon} [${issue.category}] ${issue.message}`);
  }

  if (opts.fix) {
    console.log(chalk.green('\n✓ Report written under .spark-cli/'));
  }

  return report.ok ? 0 : 1;
}

/** @deprecated use runAdaptPlatform('wechat') */
export async function runAdaptWechat(opts: GlobalOptions & { fix?: boolean }): Promise<number> {
  return runAdaptPlatform('wechat', opts);
}
