import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initStaging, stageWriteFile } from '../staging/patch-manager.js';
import type { AnimGraph } from './types.js';
import { validateAnimGraph } from './types.js';

export function readAnimFile(projectRoot: string, relPath: string): AnimGraph {
  const full = join(projectRoot, relPath);
  if (!existsSync(full)) {
    throw new Error(`Anim file not found: ${relPath}`);
  }
  const raw = JSON.parse(readFileSync(full, 'utf8')) as unknown;
  if (!validateAnimGraph(raw)) {
    throw new Error(`Invalid anim graph JSON: ${relPath}`);
  }
  return raw;
}

export function stageAnimFiles(
  projectRoot: string,
  jsonPath: string,
  graph: AnimGraph,
  scriptPath: string,
  scriptContent: string,
): void {
  initStaging(projectRoot);
  stageWriteFile(projectRoot, jsonPath, JSON.stringify(graph, null, 2) + '\n');
  stageWriteFile(projectRoot, scriptPath, scriptContent);
}
