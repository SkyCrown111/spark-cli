/**
 * Profile capture orchestration (engine-specific; safe defaults in CI).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SparkCLIConfig } from '../../config/schema.js';
import { detectEngine } from '../../engines/registry.js';
import { getProjectSparkDir } from '../../config/paths.js';

export interface ProfileCapturePlan {
  engine: string;
  method: string;
  command?: string;
  notes: string[];
  /** When true, caller may attempt execution (explicit --exec only). */
  executable: boolean;
}

export function planProfileCapture(
  projectRoot: string,
  config: SparkCLIConfig,
  opts: { exec?: boolean } = {},
): ProfileCapturePlan {
  const engine = detectEngine(projectRoot, config.project?.engine).id;
  const notes: string[] = [];
  let method = 'fixture';
  let command: string | undefined;
  let executable = false;

  if (engine === 'unity' && config.project?.unityPath) {
    method = 'unity-batch-profiler';
    command = `"${config.project.unityPath}" -batchmode -projectPath "${projectRoot}" -logFile -`;
    notes.push('Unity batch profiler requires Editor license and --exec');
    executable = !!opts.exec && existsSync(config.project.unityPath);
  } else if (engine === 'cocos-creator') {
    method = 'cocos-preview-inject';
    notes.push('Inject perf hook via preview URL �?export perf.json from browser devtools');
    command = 'Open Cocos preview �?paste .spark/scripts/perf-hook.js';
  } else if (engine === 'godot') {
    method = 'godot-profile-server';
    notes.push('Run Godot with --profile-server and pull frames via HTTP');
  } else {
    notes.push('Use a captured profile JSON with `spark-cli profile analyze`');
  }

  const outPath = join(getProjectSparkDir(projectRoot), 'profiles', 'latest.json');
  notes.push(`Suggested output: ${outPath}`);

  return { engine, method, command, notes, executable };
}
