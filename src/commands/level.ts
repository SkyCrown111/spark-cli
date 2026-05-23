import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import {
  buildCocosLevelLoaderScript,
  buildLevelTemplate,
  defaultLevelJsonPath,
  defaultLevelScriptPath,
} from '../core/level/template.js';
import { stageLevelFiles, readLevelFile } from '../core/level/io.js';
import { patchLevelFromHint } from '../core/level/patch.js';
import { appendReplayEvent } from '../core/replay/log.js';

export async function runLevelNew(
  opts: GlobalOptions,
  name: string,
  hint: string,
  outPath?: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const jsonPath = outPath ?? defaultLevelJsonPath(name);
  const level = buildLevelTemplate(name, hint);
  const scriptPath = defaultLevelScriptPath(name);
  const script = buildCocosLevelLoaderScript(level, jsonPath);

  if (opts.dryRun) {
    if (opts.json) {
      logger.json({ dryRun: true, jsonPath, scriptPath, level });
    } else {
      logger.info(chalk.yellow('Dry run — would stage:'));
      logger.info(chalk.cyan(' ', jsonPath));
      logger.info(chalk.cyan(' ', scriptPath));
    }
    return;
  }

  stageLevelFiles(root, jsonPath, level, scriptPath, script);
  appendReplayEvent(root, 'command', { cmd: 'level.new', name, jsonPath, template: true });

  if (opts.json) {
    logger.json({ jsonPath, scriptPath, zones: level.zones.length });
  } else {
    logger.info(chalk.green('✓'), `Staged level "${level.name}"`);
    logger.info(chalk.cyan(' ', jsonPath));
    logger.info(chalk.cyan(' ', scriptPath));
    logger.info(chalk.dim('  Run: spark-cli diff → spark-cli apply'));
  }
}

export async function runLevelEdit(
  opts: GlobalOptions,
  relPath: string,
  hint: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  if (!existsSync(join(root, relPath))) {
    throw new Error(`Level not found: ${relPath}. Run level new first or spark-cli apply.`);
  }
  const level = readLevelFile(root, relPath);
  const patched = patchLevelFromHint(level, hint);
  const scriptPath = defaultLevelScriptPath(patched.name);
  const script = buildCocosLevelLoaderScript(patched, relPath);

  if (opts.dryRun) {
    if (opts.json) logger.json({ dryRun: true, relPath, patched });
    return;
  }

  stageLevelFiles(root, relPath, patched, scriptPath, script);
  appendReplayEvent(root, 'command', { cmd: 'level.edit', relPath, hint: hint.slice(0, 500) });

  if (opts.json) {
    logger.json({ path: relPath, entities: patched.entities.length });
  } else {
    logger.info(chalk.green('✓'), `Staged level patch: ${relPath}`);
  }
}

export function runLevelShow(opts: GlobalOptions, relPath: string): void {
  const root = resolveProjectRoot(opts);
  const level = readLevelFile(root, relPath);
  if (opts.json) {
    logger.json(level);
  } else {
    logger.info(chalk.bold(level.name));
    logger.info(chalk.dim(level.description ?? ''));
    logger.info(
      `  zones: ${level.zones.length}  paths: ${level.paths.length}  entities: ${level.entities.length}`,
    );
    for (const z of level.zones) {
      logger.info(chalk.cyan(`  [zone] ${z.id}`), `(${z.x},${z.y}) ${z.w}x${z.h}`);
    }
  }
}
