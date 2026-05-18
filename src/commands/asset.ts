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

export function runAssetList(opts: GlobalOptions, type?: string): void {
  const root = resolveProjectRoot(opts);
  const filter = type as AssetType | undefined;
  const assets = listAssets(root, filter);

  if (opts.json) {
    printJson({ assets });
    return;
  }

  console.log(chalk.bold('\nAssets\n'));
  if (!assets.length) {
    console.log(chalk.dim('  No assets found under assets/'));
    return;
  }
  for (const a of assets) {
    console.log(`  ${chalk.cyan(a.path)}  ${chalk.dim(a.type)}  ${formatBytes(a.bytes)}`);
  }
}

export function runAssetAnalyze(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const report = analyzeAssets(root);

  if (opts.json) {
    printJson(report);
    return;
  }

  console.log(chalk.bold('\nAsset analyze\n'));
  console.log(`  Total files: ${report.total}`);
  for (const [type, stats] of Object.entries(report.byType)) {
    console.log(`  ${type}: ${stats.count} (${formatBytes(stats.bytes)})`);
  }
  console.log(chalk.bold('\nLargest\n'));
  for (const a of report.largest) {
    console.log(`  ${formatBytes(a.bytes).padStart(10)}  ${a.path}`);
  }
}

export function runAssetUnused(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const unused = findUnusedAssets(root);

  if (opts.json) {
    printJson({ unused });
    return;
  }

  console.log(chalk.bold('\nUnused assets (heuristic)\n'));
  if (!unused.length) {
    console.log(chalk.green('  None detected'));
    return;
  }
  for (const a of unused) {
    console.log(`  ${chalk.yellow('?')} ${a.path}  ${formatBytes(a.bytes)}`);
  }
  console.log(chalk.dim('\n  Review before deleting — reference detection is best-effort.'));
}

export function runAssetImport(
  opts: GlobalOptions,
  source: string,
  dest: string,
): void {
  const root = resolveProjectRoot(opts);
  if (!existsSync(source)) {
    throw new SparkCLIError(`Source not found: ${source}`, 1);
  }
  if (opts.dryRun) {
    if (opts.json) printJson({ dryRun: true, source, dest });
    else console.log(chalk.dim(`Would import ${source} → ${dest}`));
    return;
  }
  const written = importAsset(root, source, dest);
  if (opts.json) printJson({ imported: written });
  else console.log(chalk.green('✓'), 'Imported to', chalk.cyan(written));
}

export function runAssetAudit(
  opts: GlobalOptions,
  cmdOpts: { dir?: string; disable?: string },
): void {
  const root = resolveProjectRoot(opts);
  const disable = cmdOpts.disable ? cmdOpts.disable.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const issues = auditAssets(root, { dir: cmdOpts.dir, disable });

  if (opts.json) {
    printJson({ issues });
    return;
  }

  console.log(chalk.bold('\nAssets audit\n'));
  if (!issues.length) {
    console.log(chalk.green('  No issues detected'));
    return;
  }
  for (const i of issues) {
    const sev = i.severity === 'error'
      ? chalk.red('ERR')
      : i.severity === 'warn'
      ? chalk.yellow('WRN')
      : chalk.dim('hint');
    console.log(`  ${sev}  ${chalk.cyan(i.path)}  [${i.rule}] ${i.message}`);
    if (i.suggestion) console.log(chalk.dim(`        ↳ ${i.suggestion}`));
  }
}

export function runAssetFix(
  opts: GlobalOptions,
  cmdOpts: { rule: string; apply?: boolean; dir?: string },
): void {
  const root = resolveProjectRoot(opts);
  const issues = auditAssets(root, { dir: cmdOpts.dir }).filter((i: AuditIssue) => i.rule === cmdOpts.rule);
  if (!issues.length) {
    if (opts.json) printJson({ rule: cmdOpts.rule, results: [] });
    else console.log(chalk.dim(`No issues match rule "${cmdOpts.rule}"`));
    return;
  }
  const results = issues.map((issue: AuditIssue) => applyFix(root, issue, { apply: !!cmdOpts.apply }));
  if (opts.json) {
    printJson({ rule: cmdOpts.rule, applied: !!cmdOpts.apply, results });
    return;
  }
  console.log(chalk.bold(`\nAssets fix [${cmdOpts.rule}]\n`));
  for (const r of results) {
    const tag = r.applied ? chalk.green('✓') : chalk.dim('•');
    console.log(`  ${tag} ${r.path}  ${r.message}`);
  }
  if (!cmdOpts.apply) {
    console.log(chalk.dim('\n  Re-run with --apply to stage the fixes.'));
  }
}
