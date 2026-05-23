/**
 * Find Unity scene files (`.unity`) under `Assets/`.
 *
 * Mirrors the Cocos `findSceneFiles` shape so the MCP layer can treat them
 * symmetrically. Returns paths relative to `projectRoot`.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export function findUnitySceneFiles(projectRoot: string): string[] {
  const assets = join(projectRoot, 'Assets');
  if (!existsSync(assets)) return [];
  const out: string[] = [];
  const stack = [assets];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        // Skip Library/Temp-style folders just in case.
        if (name === 'Library' || name === 'Temp' || name === 'obj') continue;
        stack.push(full);
      } else if (st.isFile() && full.endsWith('.unity')) {
        out.push(relative(projectRoot, full).split(sep).join('/'));
      }
    }
  }
  return out.sort();
}
