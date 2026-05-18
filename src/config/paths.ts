import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

export function getGlobalConfigDir(): string {
  return join(homedir(), '.spark-cli');
}

export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.yaml');
}

export function getProjectSparkDir(projectRoot: string): string {
  return join(projectRoot, '.spark-cli');
}

export function getStagingDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'staging');
}

/**
 * Stable per-project slug for cross-session storage. Hashes the absolute path
 * so two projects with the same basename don't collide (`/work/foo/web` and
 * `/work/bar/web` map to different slugs).
 */
export function getProjectSlug(projectRoot: string): string {
  const abs = resolve(projectRoot);
  const hash = createHash('sha1').update(abs).digest('hex').slice(0, 10);
  const tail = abs.replace(/[\\/]+/g, '-').replace(/[^A-Za-z0-9._-]/g, '').slice(-32);
  return `${tail || 'project'}-${hash}`;
}

export function getCrossSessionMemoryDir(projectRoot: string): string {
  return join(getGlobalConfigDir(), 'projects', getProjectSlug(projectRoot), 'memory');
}

