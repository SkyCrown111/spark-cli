import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { CloudSession } from './types.js';
import { getCloudSessionPath } from './paths.js';

export function loadCloudSession(): CloudSession | null {
  const path = getCloudSessionPath();
  if (!existsSync(path)) return null;
  try {
    const session = JSON.parse(readFileSync(path, 'utf8')) as CloudSession;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      clearCloudSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveCloudSession(session: CloudSession): void {
  const path = getCloudSessionPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(session, null, 2), 'utf8');
}

export function clearCloudSession(): void {
  const path = getCloudSessionPath();
  if (existsSync(path)) rmSync(path, { force: true });
}

export function isCloudLoggedIn(): boolean {
  return loadCloudSession() !== null;
}
