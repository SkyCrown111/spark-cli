/**
 * Staging file locks for multi-agent workflows.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';

export interface StagingLockEntry {
  paths: string[];
  owner: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface StagingLocksFile {
  locks: StagingLockEntry[];
}

const LOCK_TTL_MS = 30 * 60 * 1000;

function locksPath(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'staging', 'locks.json');
}

function readLocks(projectRoot: string): StagingLocksFile {
  const p = locksPath(projectRoot);
  if (!existsSync(p)) return { locks: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as StagingLocksFile;
  } catch {
    return { locks: [] };
  }
}

function writeLocks(projectRoot: string, data: StagingLocksFile): void {
  const p = locksPath(projectRoot);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function pruneExpired(data: StagingLocksFile): StagingLocksFile {
  const now = Date.now();
  return {
    locks: data.locks.filter((l) => new Date(l.expiresAt).getTime() > now),
  };
}

function pathsOverlap(a: string[], b: string[]): boolean {
  for (const pa of a) {
    for (const pb of b) {
      if (pa === pb || pa.startsWith(pb) || pb.startsWith(pa)) return true;
    }
  }
  return false;
}

export function acquireStagingLock(
  projectRoot: string,
  paths: string[],
  owner: string,
): StagingLockEntry {
  const data = pruneExpired(readLocks(projectRoot));
  for (const lock of data.locks) {
    if (lock.owner !== owner && pathsOverlap(lock.paths, paths)) {
      throw new Error(
        `Paths locked by ${lock.owner} until ${lock.expiresAt}: ${lock.paths.join(', ')}`,
      );
    }
  }
  const now = new Date();
  const entry: StagingLockEntry = {
    paths,
    owner,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + LOCK_TTL_MS).toISOString(),
  };
  data.locks = data.locks.filter((l) => l.owner !== owner);
  data.locks.push(entry);
  writeLocks(projectRoot, data);
  return entry;
}

export function releaseStagingLock(projectRoot: string, owner: string): boolean {
  const data = pruneExpired(readLocks(projectRoot));
  const before = data.locks.length;
  data.locks = data.locks.filter((l) => l.owner !== owner);
  writeLocks(projectRoot, data);
  return data.locks.length < before;
}

export function listStagingLocks(projectRoot: string): StagingLockEntry[] {
  return pruneExpired(readLocks(projectRoot)).locks;
}
