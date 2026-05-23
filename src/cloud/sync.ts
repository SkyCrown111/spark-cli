import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { SparkCLIConfig } from '../config/schema.js';

const DEFAULT_SYNC_PATHS = [
  '.spark/settings.json',
  'assets/scripts',
  'scripts',
  'Assets/Scripts',
  '.spark/memory',
];

export function projectCloudId(projectRoot: string): string {
  return createHash('sha256').update(projectRoot).digest('hex').slice(0, 16);
}

export function collectSyncFiles(
  projectRoot: string,
  config: SparkCLIConfig,
): Record<string, string> {
  const patterns = config.cloud?.syncPaths?.length ? config.cloud.syncPaths : DEFAULT_SYNC_PATHS;
  const files: Record<string, string> = {};

  for (const pattern of patterns) {
    const full = join(projectRoot, pattern);
    if (!existsSync(full)) continue;
    const st = statSync(full);
    if (st.isFile()) {
      files[pattern.replace(/\\/g, '/')] = readFileSync(full, 'utf8');
      continue;
    }
    walkDir(full, projectRoot, files);
  }
  return files;
}

function walkDir(dir: string, root: string, out: Record<string, string>): void {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') && name !== '.spark') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'staging') continue;
      walkDir(full, root, out);
    } else {
      const rel = relative(root, full).replace(/\\/g, '/');
      if (st.size > 512_000) continue;
      try {
        out[rel] = readFileSync(full, 'utf8');
      } catch {
        /* binary skip */
      }
    }
  }
}
