/**
 * Replay playtest sessions (mock bridge or Cocos best-effort).
 */

import type { PlaytestSession } from './protocol.js';
import { hashPlaytestState, parsePlaytestSession } from './protocol.js';

export interface PlaytestReplayResult {
  ok: boolean;
  finalHash: string;
  expectedHash?: string;
  framesSimulated: number;
  message: string;
}

/** Deterministic mock replay for CI — derives hash from inputs + seed. */
export function replayPlaytestSession(
  session: PlaytestSession,
  expectedHash?: string,
): PlaytestReplayResult {
  const state = {
    seed: session.rngSeed,
    inputCount: session.inputs.length,
    lastInput: session.inputs[session.inputs.length - 1],
    checkpoints: session.checkpoints.length,
  };
  const finalHash = hashPlaytestState(state);
  const ok = expectedHash ? finalHash === expectedHash : true;
  return {
    ok,
    finalHash,
    expectedHash,
    framesSimulated: Math.max(1, Math.ceil(session.durationMs / 16)),
    message: ok ? 'Replay hash matches' : `Hash mismatch: got ${finalHash}, want ${expectedHash}`,
  };
}

export function replayPlaytestFile(
  json: string,
  expectedHash?: string,
): PlaytestReplayResult {
  return replayPlaytestSession(parsePlaytestSession(json), expectedHash);
}

export interface PlaytestCompareResult {
  match: boolean;
  a: string;
  b: string;
  message: string;
}

export function comparePlaytestHashes(a: string, b: string): PlaytestCompareResult {
  const match = a === b;
  return {
    match,
    a,
    b,
    message: match ? 'Final states match' : `Mismatch: ${a} vs ${b}`,
  };
}
