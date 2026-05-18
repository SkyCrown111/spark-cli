import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function findTscnFiles(projectRoot: string): string[] {
  const scenesDir = join(projectRoot, 'scenes');
  const out: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (name.startsWith('.')) continue;
        walk(full);
      } else if (name.endsWith('.tscn')) {
        out.push(relative(projectRoot, full).replace(/\\/g, '/'));
      }
    }
  }

  walk(scenesDir);
  if (existsSync(join(projectRoot, 'main.tscn'))) {
    out.unshift('main.tscn');
  }
  return [...new Set(out)].sort();
}
