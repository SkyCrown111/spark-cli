import chalk from 'chalk';
import { existsSync } from 'node:fs';
import {
  analyzeAssets,
  findUnusedAssets,
  importAsset,
  listAssets,
  type AssetType,
} from '../core/assets/scanner.js';
import { auditAssets, applyFix, type AuditIssue } from '../core/assets/audit.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { SparkCLIError } from '../utils/errors.js';
import { formatBytes } from '../core/validate/wechat-limits.js';
import { logger } from '../utils/logger.js';

export function runAssetList(opts: GlobalOptions, type?: string): void {
  const root = resolveProjectRoot(opts);
  const filter = type as AssetType | undefined;
  const assets = listAssets(root, filter);

  if (opts.json) {
    printJson({ assets });
    return;
  }

  logger.info(chalk.bold('\nAssets\n'));
  if (!assets.length) {
    logger.info(chalk.dim('  No assets found under assets/'));
    return;
  }
  for (const a of assets) {
    logger.info(`  ${chalk.cyan(a.path)}  ${chalk.dim(a.type)}  ${formatBytes(a.bytes)}`);
  }
}

export function runAssetAnalyze(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const report = analyzeAssets(root);

  if (opts.json) {
    printJson(report);
    return;
  }

  logger.info(chalk.bold('\nAsset analyze\n'));
  logger.info(`  Total files: ${report.total}`);
  for (const [type, stats] of Object.entries(report.byType)) {
    logger.info(`  ${type}: ${stats.count} (${formatBytes(stats.bytes)})`);
  }
  logger.info(chalk.bold('\nLargest\n'));
  for (const a of report.largest) {
    logger.info(`  ${formatBytes(a.bytes).padStart(10)}  ${a.path}`);
  }
}

export function runAssetUnused(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const unused = findUnusedAssets(root);

  if (opts.json) {
    printJson({ unused });
    return;
  }

  logger.info(chalk.bold('\nUnused assets (heuristic)\n'));
  if (!unused.length) {
    logger.info(chalk.green('  None detected'));
    return;
  }
  for (const a of unused) {
    logger.info(`  ${chalk.yellow('?')} ${a.path}  ${formatBytes(a.bytes)}`);
  }
  logger.info(chalk.dim('\n  Review before deleting — reference detection is best-effort.'));
}

export function runAssetImport(opts: GlobalOptions, source: string, dest: string): void {
  const root = resolveProjectRoot(opts);
  if (!existsSync(source)) {
    throw new SparkCLIError(`Source not found: ${source}`, 1);
  }
  if (opts.dryRun) {
    if (opts.json) printJson({ dryRun: true, source, dest });
    else logger.info(chalk.dim(`Would import ${source} → ${dest}`));
    return;
  }
  const written = importAsset(root, source, dest);
  if (opts.json) printJson({ imported: written });
  else logger.info(chalk.green('✓'), 'Imported to', chalk.cyan(written));
}

export async function runAssetAudit(
  opts: GlobalOptions,
  cmdOpts: { dir?: string; disable?: string },
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const disable = cmdOpts.disable
    ? cmdOpts.disable
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
  const issues = await auditAssets(root, { dir: cmdOpts.dir, disable });

  if (opts.json) {
    printJson({ issues });
    return;
  }

  logger.info(chalk.bold('\nAssets audit\n'));
  if (!issues.length) {
    logger.info(chalk.green('  No issues detected'));
    return;
  }
  for (const i of issues) {
    const sev =
      i.severity === 'error'
        ? chalk.red('ERR')
        : i.severity === 'warn'
          ? chalk.yellow('WRN')
          : chalk.dim('hint');
    logger.info(`  ${sev}  ${chalk.cyan(i.path)}  [${i.rule}] ${i.message}`);
    if (i.suggestion) logger.info(chalk.dim(`        ↳ ${i.suggestion}`));
  }
}

export async function runAssetFix(
  opts: GlobalOptions,
  cmdOpts: { rule: string; apply?: boolean; dir?: string },
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const issues = (await auditAssets(root, { dir: cmdOpts.dir })).filter(
    (i: AuditIssue) => i.rule === cmdOpts.rule,
  );
  if (!issues.length) {
    if (opts.json) printJson({ rule: cmdOpts.rule, results: [] });
    else logger.info(chalk.dim(`No issues match rule "${cmdOpts.rule}"`));
    return;
  }
  const results = issues.map((issue: AuditIssue) =>
    applyFix(root, issue, { apply: !!cmdOpts.apply }),
  );
  if (opts.json) {
    printJson({ rule: cmdOpts.rule, applied: !!cmdOpts.apply, results });
    return;
  }
  logger.info(chalk.bold(`\nAssets fix [${cmdOpts.rule}]\n`));
  for (const r of results) {
    const tag = r.applied ? chalk.green('✓') : chalk.dim('•');
    logger.info(`  ${tag} ${r.path}  ${r.message}`);
  }
  if (!cmdOpts.apply) {
    logger.info(chalk.dim('\n  Re-run with --apply to stage the fixes.'));
  }
}
