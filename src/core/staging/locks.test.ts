import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireStagingLock, releaseStagingLock, listStagingLocks } from './locks.js';

describe('staging locks', () => {
  it('blocks second owner on overlapping paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'spark-cli-lock-'));
    acquireStagingLock(root, ['assets/foo.ts'], 'agent-a');
    expect(() => acquireStagingLock(root, ['assets/foo.ts'], 'agent-b')).toThrow(/locked/);
    releaseStagingLock(root, 'agent-a');
    acquireStagingLock(root, ['assets/foo.ts'], 'agent-b');
    expect(listStagingLocks(root).some((l) => l.owner === 'agent-b')).toBe(true);
  });
});
