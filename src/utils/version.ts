import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined | null = null;

/** Read `package.json` version (works from `dist/cli.js` or `src/` during tests). */
export function getCliVersion(): string | undefined {
  if (cached !== null) return cached || undefined;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'package.json'),
    join(here, '..', '..', 'package.json'),
    join(here, '..', '..', '..', 'package.json'),
  ];
  for (const pkgPath of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (pkg.version) {
        cached = pkg.version;
        return pkg.version;
      }
    } catch {
      /* try next */
    }
  }
  cached = '';
  return undefined;
}
