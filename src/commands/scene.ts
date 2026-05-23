import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCocosScene } from '../engines/cocos/scene-parser.js';
import { findSceneFiles } from '../engines/cocos/scene-list.js';
import { analyzeSceneOptimizations } from '../engines/cocos/scene-optimize.js';
import { bridgeRequest } from '../bridge/client.js';
import { loadMergedConfig } from '../config/load.js';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';
import { SparkCLIError } from '../utils/errors.js';

export function runSceneList(opts: GlobalOptions): void {
  const root = resolveProjectRoot(opts);
  const scenes = findSceneFiles(root);
  if (opts.json) {
    printJson({ scenes });
    return;
  }
  logger.info(chalk.bold('\nScenes\n'));
  if (!scenes.length) {
    logger.info(chalk.dim('  No .scene files under assets/'));
    return;
  }
  for (const s of scenes) logger.info(`  ${chalk.cyan(s)}`);
}

export function runSceneAnalyze(opts: GlobalOptions, scenePath: string): void {
  const root = resolveProjectRoot(opts);
  const full = join(root, scenePath);
  if (!existsSync(full)) {
    throw new SparkCLIError(`Scene not found: ${scenePath}`, 1, ['Run: spark-cli scene list']);
  }

  const analysis = parseCocosScene(full);

  if (opts.json) {
    printJson(analysis);
    return;
  }

  logger.info(chalk.bold(`\nScene: ${analysis.sceneName}`));
  logger.info(chalk.dim(`  File: ${scenePath}`));
  logger.info(
    `  Nodes: ${analysis.nodeCount}  Components: ${analysis.componentCount}  Max depth: ${analysis.maxDepth}`,
  );
  logger.info(chalk.bold('\nTree\n'));
  logger.info(analysis.treeText);
  if (analysis.issues.length) {
    logger.info(chalk.yellow('\nIssues\n'));
    for (const i of analysis.issues) logger.info(`  • ${i}`);
  }
}

export function runSceneOptimize(opts: GlobalOptions, scenePath: string): void {
  const root = resolveProjectRoot(opts);
  const full = join(root, scenePath);
  if (!existsSync(full)) {
    throw new SparkCLIError(`Scene not found: ${scenePath}`, 1);
  }

  const analysis = parseCocosScene(full);
  const suggestions = analyzeSceneOptimizations(analysis);

  if (opts.json) {
    printJson({ scene: scenePath, suggestions });
    return;
  }

  logger.info(chalk.bold(`\nOptimize: ${analysis.sceneName}\n`));
  if (!suggestions.length) {
    logger.info(chalk.green('  No static issues detected.'));
    return;
  }
  for (const s of suggestions) {
    const icon = s.severity === 'warn' ? chalk.yellow('⚠') : chalk.blue('i');
    logger.info(`  ${icon} ${s.message}`);
  }
  if (opts.dryRun) {
    logger.info(chalk.dim('\n  (--dry-run: suggestions only, no file changes)'));
  }
}

export async function runSceneOpen(opts: GlobalOptions, scenePath: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  const full = join(root, scenePath);
  if (!existsSync(full)) {
    throw new SparkCLIError(`Scene not found: ${scenePath}`, 1, ['Run: spark-cli scene list']);
  }

  const config = await loadMergedConfig(root);
  const port = config.mcp?.port ?? 17321;

  try {
    const result = await bridgeRequest('scene.open', { path: scenePath }, { port });
    if (opts.json) {
      printJson({ ok: true, scenePath, result });
      return;
    }
    logger.info(chalk.green('✓'), `Opened in editor: ${chalk.cyan(scenePath)}`);
    if (result) logger.info(chalk.dim(JSON.stringify(result)));
  } catch (e) {
    throw new SparkCLIError(e instanceof Error ? e.message : String(e), 1, [
      'Install extensions/spark-cli-bridge in Cocos Creator and enable it',
      'See docs/bridge.md',
    ]);
  }
}
