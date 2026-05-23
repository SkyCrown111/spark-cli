import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { loadMergedConfig } from '../config/load.js';
import { analyzeProfileJson } from '../core/profile/analyze.js';
import { checkFrameBudget } from '../core/profile/budget.js';
import { planProfileCapture } from '../core/profile/capture.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runProfileCapture(
  opts: GlobalOptions,
  cmdOpts: { exec?: boolean },
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const plan = planProfileCapture(root, config, { exec: cmdOpts.exec });

  if (opts.json) {
    printJson(plan);
    return 0;
  }
  logger.info(chalk.bold('\nProfile capture plan\n'));
  logger.info(`  engine: ${plan.engine}`);
  logger.info(`  method: ${plan.method}`);
  for (const n of plan.notes) logger.info(chalk.dim(`  · ${n}`));
  if (plan.command) logger.info(chalk.dim(`  cmd: ${plan.command}`));
  return 0;
}

export async function runProfileAnalyze(opts: GlobalOptions, file: string): Promise<number> {
  const root = resolveProjectRoot(opts);
  const abs = join(root, file);
  const analysis = analyzeProfileJson(JSON.parse(readFileSync(abs, 'utf8')), file);

  if (opts.json) {
    printJson(analysis);
    return 0;
  }
  logger.info(chalk.bold('\nProfile analysis\n'));
  logger.info(`  frames: ${analysis.summary.frameCount}`);
  logger.info(`  avg: ${analysis.summary.avgFrameMs.toFixed(2)}ms`);
  logger.info(`  p95: ${analysis.summary.p95FrameMs.toFixed(2)}ms`);
  for (const s of analysis.systems.slice(0, 8)) {
    logger.info(`  · ${s.name}: avg ${s.avgMs.toFixed(2)}ms`);
  }
  return 0;
}

export async function runProfileBudget(
  opts: GlobalOptions,
  file: string,
  targetFps: number,
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const abs = join(root, file);
  const analysis = analyzeProfileJson(JSON.parse(readFileSync(abs, 'utf8')));
  const report = checkFrameBudget(analysis, targetFps);

  if (opts.json) {
    printJson(report);
    return report.ok ? 0 : 1;
  }
  logger.info(chalk.bold(`\nFrame budget @ ${targetFps} FPS (${report.budgetMs.toFixed(2)}ms)\n`));
  for (const v of report.violations) {
    const icon = v.severity === 'error' ? chalk.red('✗') : chalk.yellow('⚠');
    logger.info(`  ${icon} ${v.message}`);
  }
  return report.ok ? 0 : 1;
}
