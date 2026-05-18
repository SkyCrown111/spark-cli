import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GlobalOptions } from '../utils/output.js';
import { resolveProjectRoot } from '../utils/output.js';
import {
  buildAnimTemplate,
  buildCocosAnimControllerScript,
  defaultAnimJsonPath,
  defaultAnimScriptPath,
} from '../core/anim/template.js';
import { stageAnimFiles, readAnimFile } from '../core/anim/io.js';
import { exportAnimForCocos } from '../core/anim/export-cocos.js';
import { initStaging, stageWriteFile } from '../core/staging/patch-manager.js';
import { appendReplayEvent } from '../core/replay/log.js';

export async function runAnimNew(
  opts: GlobalOptions,
  name: string,
  spec: string,
  outPath?: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  const jsonPath = outPath ?? defaultAnimJsonPath(name);
  const graph = buildAnimTemplate(name, spec);
  const scriptPath = defaultAnimScriptPath(name);
  const script = buildCocosAnimControllerScript(graph, jsonPath);

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ dryRun: true, jsonPath, scriptPath, graph }));
    return;
  }

  stageAnimFiles(root, jsonPath, graph, scriptPath, script);
  appendReplayEvent(root, 'command', { cmd: 'anim.new', name, jsonPath, states: graph.states.length });

  if (opts.json) {
    console.log(JSON.stringify({ jsonPath, scriptPath, states: graph.states.map((s) => s.id) }));
  } else {
    console.log(chalk.green('✓'), `Staged anim "${graph.name}"`);
    console.log(chalk.cyan(' ', jsonPath));
    console.log(chalk.cyan(' ', scriptPath));
    console.log(chalk.dim(`  States: ${graph.states.map((s) => s.id).join(' → ')}`));
    console.log(chalk.dim('  Run: spark-cli diff → spark-cli apply'));
  }
}

export async function runAnimExport(
  opts: GlobalOptions,
  relPath: string,
  format: string,
): Promise<void> {
  const root = resolveProjectRoot(opts);
  if (!existsSync(join(root, relPath))) {
    throw new Error(`Anim file not found: ${relPath}`);
  }
  const graph = readAnimFile(root, relPath);
  const fmt = format || 'cocos';
  if (fmt !== 'cocos') {
    throw new Error(`Unsupported export format: ${fmt}. Use: cocos`);
  }
  const outRel = relPath.replace(/\.controller\.json$/, '.runtime.json');
  const content = exportAnimForCocos(graph);

  if (opts.dryRun) {
    if (opts.json) console.log(JSON.stringify({ dryRun: true, outRel }));
    return;
  }

  initStaging(root);
  stageWriteFile(root, outRel, content);
  appendReplayEvent(root, 'command', { cmd: 'anim.export', relPath, outRel, format: fmt });

  if (opts.json) {
    console.log(JSON.stringify({ path: outRel, format: fmt }));
  } else {
    console.log(chalk.green('✓'), `Staged export: ${outRel}`);
  }
}

export function runAnimShow(opts: GlobalOptions, relPath: string): void {
  const root = resolveProjectRoot(opts);
  const graph = readAnimFile(root, relPath);
  if (opts.json) {
    console.log(JSON.stringify(graph, null, 2));
  } else {
    console.log(chalk.bold(graph.name));
    console.log(`  states: ${graph.states.map((s) => s.id).join(', ')}`);
    console.log(`  transitions: ${graph.transitions.length}`);
  }
}
