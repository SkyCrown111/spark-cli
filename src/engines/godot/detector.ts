import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GodotProjectInfo {
  root: string;
  version?: string;
}

export function detectGodotProject(root: string): GodotProjectInfo | null {
  const projectFile = join(root, 'project.godot');
  if (!existsSync(projectFile)) return null;

  let version: string | undefined;
  const text = readFileSync(projectFile, 'utf8');
  const m = text.match(/config\/features=PackedStringArray\("([^"]+)/);
  if (m) version = m[1];
  const verLine = text.match(/config\/version="([^"]+)"/);
  if (verLine) version = verLine[1];

  return { root, version };
}
