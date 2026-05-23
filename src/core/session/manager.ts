/**
 * Session lifecycle manager.
 *
 * Handles creating, saving, loading, and listing session files
 * stored at `.spark/sessions/<id>.json`.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
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

// ── Session tags ──────────────────────────────────────────────

/** Add tags to a session. */
export function addSessionTags(projectRoot: string, id: string, tags: string[]): boolean {
  const snapshot = loadSession(projectRoot, id);
  if (!snapshot) return false;
  snapshot.tags = [...new Set([...(snapshot.tags ?? []), ...tags])];
  saveSession(projectRoot, snapshot);
  return true;
}

/** Remove tags from a session. */
export function removeSessionTags(projectRoot: string, id: string, tags: string[]): boolean {
  const snapshot = loadSession(projectRoot, id);
  if (!snapshot) return false;
  snapshot.tags = (snapshot.tags ?? []).filter((t) => !tags.includes(t));
  saveSession(projectRoot, snapshot);
  return true;
}

/** List all unique tags across all sessions. */
export function listAllTags(projectRoot: string): string[] {
  const sessions = listSessions(projectRoot);
  const tagSet = new Set<string>();
  for (const s of sessions) {
    const snapshot = loadSession(projectRoot, s.id);
    if (snapshot?.tags) {
      for (const tag of snapshot.tags) {
        tagSet.add(tag);
      }
    }
  }
  return Array.from(tagSet).sort();
}

/** Find sessions by tag. */
export function findSessionsByTag(projectRoot: string, tag: string): SessionMeta[] {
  const sessions = listSessions(projectRoot);
  return sessions.filter((s) => {
    const snapshot = loadSession(projectRoot, s.id);
    return snapshot?.tags?.includes(tag);
  });
}

// ── Cross-session full-text search ────────────────────────────

export interface SearchResult {
  session: SessionMeta;
  messageIndex: number;
  role: string;
  snippet: string;
  matchIndex: number;
}

/** Search across all sessions for a query string. */
export function searchSessions(
  projectRoot: string,
  query: string,
  maxResults = 20,
): SearchResult[] {
  const sessions = listSessions(projectRoot);
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  for (const sessionMeta of sessions) {
    if (results.length >= maxResults) break;

    const snapshot = loadSession(projectRoot, sessionMeta.id);
    if (!snapshot) continue;

    for (let i = 0; i < snapshot.messages.length; i++) {
      if (results.length >= maxResults) break;

      const msg = snapshot.messages[i];
      if (!msg) continue;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const contentLower = content.toLowerCase();
      const matchIdx = contentLower.indexOf(queryLower);

      if (matchIdx >= 0) {
        // Extract snippet around the match
        const snippetStart = Math.max(0, matchIdx - 40);
        const snippetEnd = Math.min(content.length, matchIdx + query.length + 40);
        const snippet =
          (snippetStart > 0 ? '...' : '') +
          content.slice(snippetStart, snippetEnd) +
          (snippetEnd < content.length ? '...' : '');

        results.push({
          session: sessionMeta,
          messageIndex: i,
          role: msg.role,
          snippet,
          matchIndex: matchIdx,
        });
      }
    }
  }

  return results;
}

// ── Session auto-expiry ───────────────────────────────────────

export interface ExpiryOptions {
  /** Maximum age in days (default 30). */
  maxAgeDays?: number;
  /** Maximum number of sessions to keep (default 100). */
  maxSessions?: number;
  /** Whether to actually delete expired sessions (default false = dry run). */
  deleteExpired?: boolean;
}

export interface ExpiryResult {
  expired: string[];
  kept: string[];
  deleted: string[];
}

/** Clean up old sessions based on age and count limits. */
export function cleanupSessions(projectRoot: string, options: ExpiryOptions = {}): ExpiryResult {
  const maxAgeDays = options.maxAgeDays ?? 30;
  const maxSessions = options.maxSessions ?? 100;
  const deleteExpired = options.deleteExpired ?? false;

  const sessions = listSessions(projectRoot);
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const result: ExpiryResult = { expired: [], kept: [], deleted: [] };

  // Sort by updatedAt ascending (oldest first)
  const sorted = [...sessions].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  for (let i = 0; i < sorted.length; i++) {
    const session = sorted[i];
    const updatedAt = new Date(session.updatedAt).getTime();
    const age = now - updatedAt;

    const isExpired = age > maxAgeMs;
    const isOverLimit = i < sorted.length - maxSessions;

    if (isExpired || isOverLimit) {
      result.expired.push(session.id);
      if (deleteExpired) {
        deleteSession(projectRoot, session.id);
        result.deleted.push(session.id);
      }
    } else {
      result.kept.push(session.id);
    }
  }

  return result;
}
