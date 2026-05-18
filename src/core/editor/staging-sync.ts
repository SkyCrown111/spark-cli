import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasStaging,
  loadManifest,
  stageWriteFile,
  initStaging,
  type StagingManifest,
} from '../staging/patch-manager.js';
import { getStagingDir } from '../../config/paths.js';

export interface StagingSnapshot {
  manifest: StagingManifest | null;
  files: Record<string, string>;
}

export function readStagingSnapshot(projectRoot: string): StagingSnapshot {
  if (!hasStaging(projectRoot)) {
    return { manifest: null, files: {} };
  }
  const manifest = loadManifest(projectRoot);
  const files: Record<string, string> = {};
  const base = join(getStagingDir(projectRoot), 'files');
  for (const f of manifest.files) {
    const staged = join(base, f.path);
    if (existsSync(staged)) {
      files[f.path] = readFileSync(staged, 'utf8');
    }
  }
  return { manifest, files };
}

export function writeStagedFile(projectRoot: string, relPath: string, content: string): void {
  if (!hasStaging(projectRoot)) initStaging(projectRoot);
  stageWriteFile(projectRoot, relPath, content);
}

export function readProjectOrStaged(
  projectRoot: string,
  relPath: string,
): { content: string; source: 'project' | 'staging' } | null {
  const staged = join(getStagingDir(projectRoot), 'files', relPath);
  if (existsSync(staged)) {
    return { content: readFileSync(staged, 'utf8'), source: 'staging' };
  }
  const target = join(projectRoot, relPath);
  if (existsSync(target)) {
    return { content: readFileSync(target, 'utf8'), source: 'project' };
  }
  return null;
}

export function persistStagedToDisk(projectRoot: string, relPath: string, content: string): void {
  writeStagedFile(projectRoot, relPath, content);
  const target = join(projectRoot, relPath);
  if (existsSync(target)) {
    writeFileSync(target, content, 'utf8');
  }
}
