import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface UnityProjectInfo {
  root: string;
  version?: string;
}

export function detectUnityProject(root: string): UnityProjectInfo | null {
  const assets = join(root, 'Assets');
  const projectSettings = join(root, 'ProjectSettings');
  if (!existsSync(assets) || !existsSync(projectSettings)) {
    return null;
  }

  let version: string | undefined;
  const versionFile = join(projectSettings, 'ProjectVersion.txt');
  if (existsSync(versionFile)) {
    const text = readFileSync(versionFile, 'utf8');
    const m = text.match(/m_EditorVersion:\s*(\S+)/);
    if (m) version = m[1];
  }

  return { root, version };
}

export function isUnityProject(root: string): boolean {
  return detectUnityProject(root) !== null;
}
