import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CocosProjectInfo {
  root: string;
  version?: string;
}

export function detectCocosProject(root: string): CocosProjectInfo | null {
  const pkg = join(root, 'package.json');
  if (!existsSync(pkg)) {
    return null;
  }
  const assets = join(root, 'assets');
  if (!existsSync(assets)) {
    return null;
  }
  let version: string | undefined;
  const settingsV2 = join(root, 'settings', 'v2', 'packages', 'project.json');
  if (existsSync(settingsV2)) {
    try {
      const json = JSON.parse(readFileSync(settingsV2, 'utf8')) as Record<string, unknown>;
      version =
        (json.version as string) ??
        (json.engine as { version?: string })?.version;
    } catch {
      /* ignore */
    }
  }
  return { root, version };
}

export function isCocosProject(root: string): boolean {
  return detectCocosProject(root) !== null;
}
