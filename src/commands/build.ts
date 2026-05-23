import chalk from 'chalk';
import { loadMergedConfig } from '../config/load.js';
import { buildWechatCocos } from '../engines/cocos/build-wechat.js';
import { analyzeWechatBuild } from '../engines/wechat/build-analyzer.js';
import { compareToLimits, formatBytes, loadWechatRules } from '../core/validate/wechat-limits.js';
import { suggestWechatSplits } from '../engines/wechat/suggest-split.js';
import { planGodotExport } from '../engines/godot/build.js';
import { planUnrealBuild } from '../engines/unreal/build.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { logger } from '../utils/logger.js';

export async function runBuildWechat(opts: GlobalOptions): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const result = buildWechatCocos(root, config, { dryRun: opts.dryRun });

  if (opts.json) {
    printJson(result);
    return result.ok ? 0 : 1;
  }

  logger.info(chalk.bold('\nBuild WeChat\n'));
  logger.info(chalk.dim('  Command:'), result.command);
  logger.info(result.ok ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.ok ? 0 : 1;
}

export function runBuildAnalyze(opts: GlobalOptions): number {
  const root = resolveProjectRoot(opts);
  const rules = loadWechatRules(root);

  try {
    const sizes = analyzeWechatBuild(root);
    const checks = compareToLimits(sizes, rules);

    if (opts.json) {
      printJson({ sizes, checks, rules: rules.limits });
      return checks.every((c) => c.ok || c.severity === 'info') ? 0 : 1;
    }

    logger.info(chalk.bold('\nBuild analyze (WeChat)\n'));
    logger.info(chalk.dim(`  Dir: ${sizes.buildDir}`));
    logger.info(`  Main:  ${formatBytes(sizes.mainBytes)}`);
    for (const s of sizes.subpackages) {
      logger.info(`  Sub "${s.name}": ${formatBytes(s.bytes)} (${s.root})`);
    }
    logger.info(`  Total: ${formatBytes(sizes.totalBytes)}  (${sizes.fileCount} files)\n`);

    for (const c of checks) {
      if (c.severity === 'info' && c.ok) continue;
      const icon = c.ok
        ? chalk.green('✓')
        : c.severity === 'error'
          ? chalk.red('✗')
          : chalk.yellow('⚠');
      logger.info(`  ${icon} ${c.message}`);
    }

    const failed = checks.some((c) => !c.ok && c.severity === 'error');
    return failed ? 1 : 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (opts.json) {
      printJson({ error: msg });
      return 1;
    }
    logger.error(chalk.red(msg));
    return 1;
  }
}

export function runBuildGodot(opts: GlobalOptions, platform: string): number {
  const root = resolveProjectRoot(opts);
  const result = planGodotExport(root, platform, { dryRun: opts.dryRun });

  if (opts.json) {
    printJson(result);
    return result.ok ? 0 : 1;
  }

  logger.info(chalk.bold('\nBuild Godot\n'));
  logger.info(chalk.dim('  Command:'), result.command);
  logger.info(result.ok ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.ok ? 0 : 1;
}

export function runBuildUnreal(opts: GlobalOptions, target: string): number {
  const root = resolveProjectRoot(opts);
  const result = planUnrealBuild(root, target, { dryRun: opts.dryRun });

  if (opts.json) {
    printJson(result);
    return result.ok ? 0 : 1;
  }

  logger.info(chalk.bold('\nBuild Unreal\n'));
  logger.info(chalk.dim('  Command:'), result.command);
  logger.info(result.ok ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.ok ? 0 : 1;
}

export function runBuildSuggestSplit(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const suggestions = suggestWechatSplits(root);

  if (opts.json) {
    printJson({ suggestions });
    return;
  }

  logger.info(chalk.bold('\nSuggest subpackages\n'));
  for (const s of suggestions) {
    logger.info(chalk.cyan(`  ${s.name}`), chalk.dim(`→ ${s.root}`));
    logger.info(chalk.dim(`    ${s.reason}`));
    if (s.estimatedAssets.length) {
      logger.info(chalk.dim(`    assets: ${s.estimatedAssets.join(', ')}`));
    }
  }
}
