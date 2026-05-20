/**
 * Resolve the directory of bundled skills (`…/dist/skills` when running the
 * built CLI, or repo `skills/` when developing from source).
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getBuiltinSkillsDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'skills'),
    join(here, '..', 'skills'),
    join(here, '..', '..', '..', 'skills'),
    join(process.cwd(), 'skills'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}
