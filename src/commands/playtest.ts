import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { detectEngine } from '../engines/registry.js';
import { loadMergedConfig } from '../config/load.js';
import {
  createPlaytestSession,
  serializePlaytestSession,
} from '../core/playtest/protocol.js';
import { replayPlaytestFile, comparePlaytestHashes } from '../core/playtest/runner.js';
import type { GlobalOptions } from '../utils/output.js';
import { printJson, resolveProjectRoot } from '../utils/output.js';

export async function runPlaytestRecord(opts: GlobalOptions, scene?: string): Promise<number> {
  const root = resolveProjectRoot(opts);
  const config = await loadMergedConfig(root);
  const engine = detectEngine(root, config.project?.engine).id;
  const session = createPlaytestSession({
    engine,
    scene: scene ?? 'assets/scenes/main.scene',
  });
  const rel = `.spark-cli/playtests/record-${Date.now()}.json`;
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, serializePlaytestSession(session), 'utf8');

  if (opts.json) {
    printJson({ path: rel, session });
    return 0;
  }
  console.log(chalk.green(`✓ Recorded ${rel}`));
  return 0;
}

export async function runPlaytestReplay(
  opts: GlobalOptions,
  file: string,
  expectedHash?: string,
): Promise<number> {
  const root = resolveProjectRoot(opts);
  const raw = readFileSync(join(root, file), 'utf8');
  const result = replayPlaytestFile(raw, expectedHash);

  if (opts.json) {
    printJson(result);
    return result.ok ? 0 : 1;
  }
  console.log(result.ok ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.ok ? 0 : 1;
}

export async function runPlaytestCompare(
  opts: GlobalOptions,
  a: string,
  b: string,
): Promise<number> {
  const result = comparePlaytestHashes(a, b);
  if (opts.json) {
    printJson(result);
    return result.match ? 0 : 1;
  }
  console.log(result.match ? chalk.green('✓') : chalk.red('✗'), result.message);
  return result.match ? 0 : 1;
}
