import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { saveCloudSession, loadCloudSession, clearCloudSession } from './session.js';

describe('cloud session', () => {
  const origHome = process.env.USERPROFILE || process.env.HOME;

  beforeEach(() => {
    const fakeHome = mkdtempSync(join(tmpdir(), 'gcli-home-'));
    if (process.platform === 'win32') process.env.USERPROFILE = fakeHome;
    else process.env.HOME = fakeHome;
  });

  afterEach(() => {
    if (origHome) {
      if (process.platform === 'win32') process.env.USERPROFILE = origHome;
      else process.env.HOME = origHome;
    }
    clearCloudSession();
  });

  it('saves and loads session', () => {
    saveCloudSession({
      accessToken: 'tok',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      user: { id: 'u1' },
    });
    expect(loadCloudSession()?.accessToken).toBe('tok');
  });
});
