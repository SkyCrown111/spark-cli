/**
 * Session lifecycle manager.
 *
 * Handles creating, saving, loading, and listing session files
 * stored at `.spark-cli/sessions/<id>.json`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectSparkDir } from '../../config/paths.js';
import { serializeSession, deserializeSession, type SessionSnapshot } from './serializer.js';

export type { SessionSnapshot };

function getSessionsDir(projectRoot: string): string {
  return join(getProjectSparkDir(projectRoot), 'sessions');
}

function sessionPath(projectRoot: string, id: string): string {
  return join(getSessionsDir(projectRoot), `${id}.json`);
}

/** Generate a unique session ID. */
export function generateSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Create a new session with an ID and initial metadata. */
export function createSession(projectRoot: string, model: string, name?: string): SessionSnapshot {
  const id = generateSessionId();
  const now = new Date().toISOString();
  const snapshot: SessionSnapshot = {
    id,
    projectRoot,
    name,
    history: [],
    messages: [],
    writeMode: 'staging',
    permissionMode: 'default',
    effortLevel: 'medium',
    alwaysAllowSet: [],
    plan: { phase: 'normal' },
    model,
    title: name || '',
    startedAt: now,
    updatedAt: now,
  };
  // Persist immediately
  saveSession(projectRoot, snapshot);
  return snapshot;
}

/** Save a session snapshot to disk. */
export function saveSession(projectRoot: string, snapshot: SessionSnapshot): void {
  snapshot.updatedAt = new Date().toISOString();
  const dir = getSessionsDir(projectRoot);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(sessionPath(projectRoot, snapshot.id), serializeSession(snapshot));
}

/** Load a session from disk by ID. */
export function loadSession(projectRoot: string, id: string): SessionSnapshot | undefined {
  const path = sessionPath(projectRoot, id);
  if (!existsSync(path)) return undefined;
  try {
    return deserializeSession(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Find the most recent session for this project. */
export function findMostRecent(projectRoot: string): SessionSnapshot | undefined {
  const dir = getSessionsDir(projectRoot);
  if (!existsSync(dir)) return undefined;

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return deserializeSession(readFileSync(join(dir, f), 'utf8'));
      } catch {
        return undefined;
      }
    })
    .filter((s): s is SessionSnapshot => s !== undefined);

  if (files.length === 0) return undefined;

  // Sort by updatedAt descending
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files[0];
}

/** List all sessions for this project, sorted by recency. */
export interface SessionMeta {
  id: string;
  name: string;
  title: string;
  model: string;
  startedAt: string;
  updatedAt: string;
  messageCount: number;
}

export function listSessions(projectRoot: string): SessionMeta[] {
  const dir = getSessionsDir(projectRoot);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const s = deserializeSession(readFileSync(join(dir, f), 'utf8'));
        return {
          id: s.id,
          name: s.name ?? '',
          title: s.title,
          model: s.model,
          startedAt: s.startedAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        };
      } catch {
        return undefined;
      }
    })
    .filter((m): m is SessionMeta => m !== undefined)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Delete a session by ID. */
export function deleteSession(projectRoot: string, id: string): boolean {
  const path = sessionPath(projectRoot, id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}