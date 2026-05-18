import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stageWriteFile, initStaging } from '../staging/patch-manager.js';
import type { LevelData } from './types.js';
import { validateLevelData } from './types.js';

export function readLevelFile(projectRoot: string, relPath: string): LevelData {
  const full = join(projectRoot, relPath);
  if (!existsSync(full)) {
    throw new Error(`Level file not found: ${relPath}`);
  }
  const raw = JSON.parse(readFileSync(full, 'utf8')) as unknown;
  if (!validateLevelData(raw)) {
    throw new Error(`Invalid level JSON: ${relPath}`);
  }
  return raw;
}

export function stageLevelFiles(
  projectRoot: string,
  jsonPath: string,
  level: LevelData,
  scriptPath: string,
  scriptContent: string,
): void {
  initStaging(projectRoot);
  stageWriteFile(projectRoot, jsonPath, JSON.stringify(level, null, 2) + '\n');
  stageWriteFile(projectRoot, scriptPath, scriptContent);
}
