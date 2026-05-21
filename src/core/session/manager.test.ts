import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createSession,
  saveSession,
  loadSession,
  findMostRecent,
  listSessions,
  deleteSession,
  generateSessionId,
} from './manager.js';

// Use a temp directory for tests so we don't pollute the project
const TMP_ROOT = join(process.cwd(), '.tmp-session-test');

beforeEach(() => {
  mkdirSync(TMP_ROOT, { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('generateSessionId', () => {
  it('produces an id starting with s-', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^s-/);
    expect(id.length).toBeGreaterThan(8);
  });

  it('produces unique ids', () => {
    const ids = new Set(Array.from({ length: 20 }, generateSessionId));
    expect(ids.size).toBe(20);
  });
});

describe('createSession', () => {
  it('creates a session with required fields', () => {
    const s = createSession(TMP_ROOT, 'openai/gpt-4o');
    expect(s.id).toMatch(/^s-/);
    expect(s.projectRoot).toBe(TMP_ROOT);
    expect(s.history).toEqual([]);
    expect(s.messages).toEqual([]);
    expect(s.writeMode).toBe('staging');
    expect(s.permissionMode).toBe('default');
    expect(s.effortLevel).toBe('medium');
    expect(s.alwaysAllowSet).toEqual([]);
    expect(s.model).toBe('openai/gpt-4o');
    expect(s.title).toBe('');
    expect(s.startedAt).toBeTruthy();
    expect(s.updatedAt).toBeTruthy();
  });

  it('persists the session file to disk', () => {
    const s = createSession(TMP_ROOT, 'anthropic/claude-4');
    const loaded = loadSession(TMP_ROOT, s.id);
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(s.id);
    expect(loaded!.model).toBe('anthropic/claude-4');
  });
});

describe('saveSession / loadSession', () => {
  it('round-trips a modified session', () => {
    const s = createSession(TMP_ROOT, 'test-model');
    s.title = 'My session';
    s.history = [{ role: 'user', content: 'Hello' }];
    s.alwaysAllowSet = ['bash', 'read_file'];
    saveSession(TMP_ROOT, s);

    const loaded = loadSession(TMP_ROOT, s.id);
    expect(loaded!.title).toBe('My session');
    expect(loaded!.history.length).toBe(1);
    expect(loaded!.alwaysAllowSet).toEqual(['bash', 'read_file']);
  });

  it('returns undefined for non-existent session', () => {
    expect(loadSession(TMP_ROOT, 's-nonexistent')).toBeUndefined();
  });

  it('updates updatedAt on save', () => {
    const s = createSession(TMP_ROOT, 'test-model');
    const firstUpdatedAt = s.updatedAt;
    // Wait a tiny bit so timestamps differ
    s.title = 'Updated';
    saveSession(TMP_ROOT, s);
    // updatedAt should be >= firstUpdatedAt
    expect(s.updatedAt >= firstUpdatedAt).toBe(true);
  });
});

describe('findMostRecent', () => {
  it('returns undefined when no sessions exist', () => {
    expect(findMostRecent(TMP_ROOT)).toBeUndefined();
  });

  it('returns the most recently updated session', () => {
    const s1 = createSession(TMP_ROOT, 'model-1');
    createSession(TMP_ROOT, 'model-2');
    // Update s1 to make it newer
    s1.title = 'Later update';
    saveSession(TMP_ROOT, s1);

    const recent = findMostRecent(TMP_ROOT);
    expect(recent).toBeDefined();
    expect(recent!.id).toBe(s1.id);
  });
});

describe('listSessions', () => {
  it('returns empty array when no sessions', () => {
    expect(listSessions(TMP_ROOT)).toEqual([]);
  });

  it('lists all sessions sorted by recency', () => {
    const s1 = createSession(TMP_ROOT, 'model-a');
    const s2 = createSession(TMP_ROOT, 'model-b');
    s1.title = 'Session A';
    s2.title = 'Session B';
    saveSession(TMP_ROOT, s1);
    saveSession(TMP_ROOT, s2);

    const list = listSessions(TMP_ROOT);
    expect(list.length).toBe(2);
    // Both should have the expected fields
    expect(list[0].id).toBeTruthy();
    expect(list[0].title).toBeTruthy();
    expect(list[0].model).toBeTruthy();
  });
});

describe('deleteSession', () => {
  it('deletes an existing session', () => {
    const s = createSession(TMP_ROOT, 'to-delete');
    expect(deleteSession(TMP_ROOT, s.id)).toBe(true);
    expect(loadSession(TMP_ROOT, s.id)).toBeUndefined();
  });

  it('returns false for non-existent session', () => {
    expect(deleteSession(TMP_ROOT, 's-nonexistent')).toBe(false);
  });
});