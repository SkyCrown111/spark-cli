import { describe, it, expect } from 'vitest';
import { createPlaytestSession, hashPlaytestState } from './protocol.js';
import { replayPlaytestSession } from './runner.js';

describe('playtest runner', () => {
  it('replays deterministically from seed', () => {
    const session = createPlaytestSession({ rngSeed: 99, inputs: [{ t: 0, type: 'key', code: 'A' }] });
    const a = replayPlaytestSession(session);
    const expected = a.finalHash;
    const b = replayPlaytestSession(session, expected);
    expect(b.ok).toBe(true);
    expect(hashPlaytestState({ seed: 99 })).toBeTruthy();
  });
});
