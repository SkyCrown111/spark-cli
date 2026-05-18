import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function findSceneFiles(projectRoot: string): string[] {
  const scenesDir = join(projectRoot, 'assets');
  const out: string[] = [];

  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name === 'library' || name === 'node_modules') continue;
        walk(full);
      } else if (name.endsWith('.scene')) {
        out.push(relative(projectRoot, full).replace(/\\/g, '/'));
      }
    }
  }

  walk(scenesDir);
  return out.sort();
}
