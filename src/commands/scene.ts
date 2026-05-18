import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseCocosScene } from '../engines/cocos/scene-parser.js';
import { findSceneFiles } from '../engines/cocos/scene-list.js';
import { analyzeSceneOptimizations } from '../engines/cocos/scene-optimize.js';
import { bridgeRequest } from '../bridge/client.js';
import { loadMergedConfig } from '../config/load.js';
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
  console.log(chalk.bold('\nScenes\n'));
  if (!scenes.length) {
    console.log(chalk.dim('  No .scene files under assets/'));
    return;
  }
  for (const s of scenes) console.log(`  ${chalk.cyan(s)}`);
}

export function runSceneAnalyze(opts: GlobalOptions, scenePath: string): void {
  const root = resolveProjectRoot(opts);
  const full = join(root, scenePath);
  if (!existsSync(full)) {
    throw new SparkCLIError(`Scene not found: ${scenePath}`, 1, [
      'Run: spark-cli scene list',
    ]);
  }

  const analysis = parseCocosScene(full);

  if (opts.json) {
    printJson(analysis);
    return;
  }

  console.log(chalk.bold(`\nScene: ${analysis.sceneName}`));
  console.log(chalk.dim(`  File: ${scenePath}`));
  console.log(
    `  Nodes: ${analysis.nodeCount}  Components: ${analysis.componentCount}  Max depth: ${analysis.maxDepth}`,
  );
  console.log(chalk.bold('\nTree\n'));
  console.log(analysis.treeText);
  if (analysis.issues.length) {
    console.log(chalk.yellow('\nIssues\n'));
    for (const i of analysis.issues) console.log(`  • ${i}`);
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

  console.log(chalk.bold(`\nOptimize: ${analysis.sceneName}\n`));
  if (!suggestions.length) {
    console.log(chalk.green('  No static issues detected.'));
    return;
  }
  for (const s of suggestions) {
    const icon = s.severity === 'warn' ? chalk.yellow('⚠') : chalk.blue('i');
    console.log(`  ${icon} ${s.message}`);
  }
  if (opts.dryRun) {
    console.log(chalk.dim('\n  (--dry-run: suggestions only, no file changes)'));
  }
}

export async function runSceneOpen(opts: GlobalOptions, scenePath: string): Promise<void> {
  const root = resolveProjectRoot(opts);
  const full = join(root, scenePath);
  if (!existsSync(full)) {
    throw new SparkCLIError(`Scene not found: ${scenePath}`, 1, [
      'Run: spark-cli scene list',
    ]);
  }

  const config = await loadMergedConfig(root);
  const port = config.mcp?.port ?? 17321;

  try {
    const result = await bridgeRequest('scene.open', { path: scenePath }, { port });
    if (opts.json) {
      printJson({ ok: true, scenePath, result });
      return;
    }
    console.log(chalk.green('✓'), `Opened in editor: ${chalk.cyan(scenePath)}`);
    if (result) console.log(chalk.dim(JSON.stringify(result)));
  } catch (e) {
    throw new SparkCLIError(
      e instanceof Error ? e.message : String(e),
      1,
      [
        'Install extensions/spark-cli-bridge in Cocos Creator and enable it',
        'See docs/bridge.md',
      ],
    );
  }
}
